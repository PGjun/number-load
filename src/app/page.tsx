'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'intro' | 'showing' | 'playing' | 'gameover' | 'complete';

interface Position {
  row: number;
  col: number;
}

interface Cell {
  number: number | null; // null이면 빈 칸
  row: number;
  col: number;
}

export default function MemoryPathGame() {
  const [gameState, setGameState] = useState<GameState>('intro');
  const [currentNumber, setCurrentNumber] = useState(1);
  const [playerPos, setPlayerPos] = useState<Position>({ row: 0, col: 0 });
  const [showNumbers, setShowNumbers] = useState(true);
  const [visibleRange, setVisibleRange] = useState<number[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [lastMoveTime, setLastMoveTime] = useState(Date.now());
  const [board, setBoard] = useState<Cell[][]>([]);
  const [numberPositions, setNumberPositions] = useState<Map<number, Position>>(new Map());
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [completionTime, setCompletionTime] = useState<number>(0);
  const [shakeBoard, setShakeBoard] = useState(false);
  const [hasSeenNumbers, setHasSeenNumbers] = useState(false);
  
  const boardRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedBoardRef = useRef<{ board: Cell[][], positions: Map<number, Position> } | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  
  const COLS = 6; // PC, 모바일 모두 6열
  const TOTAL_NUMBERS = 50;
  const ROWS = Math.ceil(TOTAL_NUMBERS * 1.2 / COLS); // 빈 칸 고려해서 더 많은 행

  // DFS로 완전 랜덤 경로 생성 (50개면 충분히 빠름)
  const generateRandomPath = useCallback(() => {
    const newBoard: Cell[][] = Array(ROWS).fill(null).map((_, row) => 
      Array(COLS).fill(null).map((_, col) => ({
        number: null,
        row,
        col
      }))
    );

    const positions = new Map<number, Position>();
    
    const directions = [
      { row: 0, col: 1 },   // 오른쪽
      { row: 0, col: -1 },  // 왼쪽
      { row: 1, col: 0 },   // 아래
      { row: -1, col: 0 },  // 위
    ];
    
    const shuffle = <T,>(arr: T[]): T[] => {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    
    // DFS로 경로 찾기
    const findPath = (startRow: number, startCol: number): Position[] | null => {
      const visited = new Set<string>();
      const path: Position[] = [];
      
      const dfs = (row: number, col: number): boolean => {
        const key = `${row},${col}`;
        if (visited.has(key)) return false;
        
        visited.add(key);
        path.push({ row, col });
        
        if (path.length === TOTAL_NUMBERS + 1) return true;
        
        const dirs = shuffle(directions);
        for (const dir of dirs) {
          const newRow = row + dir.row;
          const newCol = col + dir.col;
          
          if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
            if (dfs(newRow, newCol)) return true;
          }
        }
        
        visited.delete(key);
        path.pop();
        return false;
      };
      
      return dfs(startRow, startCol) ? path : null;
    };
    
    // 경로 생성 (여러 시작점 시도)
    let path: Position[] | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const startRow = Math.floor(Math.random() * Math.min(3, ROWS));
      const startCol = Math.floor(Math.random() * COLS);
      path = findPath(startRow, startCol);
      if (path) break;
    }
    
    if (!path || path.length < TOTAL_NUMBERS + 1) {
      console.error('Failed to generate path');
      // 폴백: 지그재그
      path = [];
      for (let i = 0; i <= TOTAL_NUMBERS; i++) {
        const row = Math.floor(i / COLS);
        const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
        if (row < ROWS) path.push({ row, col });
      }
    }

    // 경로를 보드에 배치
    path.forEach((pos, index) => {
      if (index <= TOTAL_NUMBERS && pos.row >= 0 && pos.row < ROWS && pos.col >= 0 && pos.col < COLS) {
        newBoard[pos.row][pos.col].number = index; // 0 = START, 1~50
        positions.set(index, pos);
      }
    });

    setBoard(newBoard);
    setNumberPositions(positions);
    
    const startPos = positions.get(0)!;
    setPlayerPos(startPos);
    
    return { board: newBoard, positions };
  }, [ROWS, COLS, TOTAL_NUMBERS]);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 게임 초기화 시 보드 생성
  useEffect(() => {
    if (board.length === 0 && !isMobile) {
      generateRandomPath();
    }
  }, [board.length, generateRandomPath, isMobile]);
  
  // 모바일 변경 시 보드 재생성
  useEffect(() => {
    if (isMobile !== undefined) {
      // 모바일 상태가 변경되면 보드 초기화
      setBoard([]);
      setGameState('intro');
      setTimeout(() => {
        generateRandomPath();
      }, 100);
    }
  }, [isMobile]);

  // 초기 애니메이션 (시작 위치에서 2초간 보여주기)
  useEffect(() => {
    if (gameState === 'showing') {
      setShowNumbers(true);
      setStartTime(Date.now());
      
      // 2초간 보여주고 숨김
      const hideTimer = setTimeout(() => {
        setShowNumbers(false);
        setGameState('playing');
        setLastMoveTime(Date.now());
      }, 2000);

      return () => clearTimeout(hideTimer);
    }
  }, [gameState]);

  // 1초 대기 시 주변 숫자 표시
  useEffect(() => {
    if (gameState === 'playing') {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = setTimeout(() => {
        // 현재 위치 주변 5x5 영역의 숫자 표시 (2칸)
        const visible: number[] = [];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const newRow = playerPos.row + dr;
            const newCol = playerPos.col + dc;
            if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
              const cell = board[newRow]?.[newCol];
              if (cell?.number !== null && cell?.number !== undefined) {
                visible.push(cell.number);
              }
            }
          }
        }
        setVisibleRange(visible);
        setHasSeenNumbers(true); // 숫자를 봤다고 표시!

        // 1초 후 다시 숨김
        setTimeout(() => {
          setVisibleRange([]);
        }, 1000);
      }, 1000);

      return () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
      };
    }
  }, [gameState, playerPos, lastMoveTime, ROWS, board]);

  // 타이머 업데이트
  useEffect(() => {
    if (gameState === 'playing') {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [gameState, startTime]);

  // 플레이어 위치에 따라 카메라 스크롤
  useEffect(() => {
    if (gameState === 'playing') {
      const TILE_HEIGHT = 92; // 80px 타일 + 12px gap
      const VISIBLE_HEIGHT = 600; // 보드 컨테이너 높이
      
      // 플레이어를 화면 중앙에 유지
      const playerY = playerPos.row * TILE_HEIGHT;
      const targetScroll = Math.max(0, playerY - VISIBLE_HEIGHT / 2 + TILE_HEIGHT / 2);
      
      setScrollOffset(targetScroll);
    }
  }, [playerPos, gameState]);

  // 방향키 버튼 클릭 핸들러 (모바일용)
  const handleDirectionClick = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameState !== 'playing') return;

    let newRow = playerPos.row;
    let newCol = playerPos.col;

    if (direction === 'up') newRow -= 1;
    else if (direction === 'down') newRow += 1;
    else if (direction === 'left') newCol -= 1;
    else if (direction === 'right') newCol += 1;

    movePlayer(newRow, newCol);
  }, [gameState, playerPos]);

  // 플레이어 이동 로직 (키보드와 터치 공통)
  const movePlayer = useCallback((newRow: number, newCol: number) => {
    // 범위 체크
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
      return;
    }

    // 빈 칸인지 체크
    const targetCell = board[newRow]?.[newCol];
    if (!targetCell || targetCell.number === null) {
      return;
    }

    // 이동
    setPlayerPos({ row: newRow, col: newCol });
    setLastMoveTime(Date.now());
    setVisibleRange([]);

    // 숫자 검증
    const steppedNumber = targetCell.number;
    if (steppedNumber === currentNumber) {
      // 보드 흔들기 효과!
      setShakeBoard(true);
      setTimeout(() => setShakeBoard(false), 400);
      
      // 진동 효과 (모바일)
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      
      // 새로운 발판으로 이동 시 힌트 리셋
      setHasSeenNumbers(false);
      
      if (steppedNumber === TOTAL_NUMBERS) {
        const finalTime = Date.now() - startTime;
        setCompletionTime(finalTime);
        setGameState('complete');
      } else {
        setCurrentNumber(steppedNumber + 1);
      }
    } else {
      setGameState('gameover');
    }
  }, [board, currentNumber, ROWS, COLS, startTime, TOTAL_NUMBERS]);

  // 키보드 입력 처리
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (gameState !== 'playing') return;

    let newRow = playerPos.row;
    let newCol = playerPos.col;

    // WASD 또는 방향키
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      newRow -= 1;
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
      newRow += 1;
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      newCol -= 1;
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      newCol += 1;
    } else {
      return;
    }

    movePlayer(newRow, newCol);
  }, [gameState, playerPos, movePlayer]);

  // 키보드 이벤트 리스너
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // 새로운 게임 시작 (새로운 맵)
  const startNewGame = () => {
    const result = generateRandomPath();
    savedBoardRef.current = result;
    setGameState('showing');
    setCurrentNumber(1);
    setVisibleRange([]);
    setScrollOffset(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    setCompletionTime(0);
  };

  // 같은 맵으로 다시 도전
  const retryGame = () => {
    if (savedBoardRef.current) {
      const { board: savedBoard, positions: savedPositions } = savedBoardRef.current;
      setBoard(savedBoard);
      setNumberPositions(savedPositions);
      const startPos = savedPositions.get(0)!;
      setPlayerPos(startPos);
    }
    setGameState('showing');
    setCurrentNumber(1);
    setVisibleRange([]);
    setScrollOffset(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    setCompletionTime(0);
  };

  // 시간 포맷팅 함수
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // 게임 보드 렌더링
  const renderBoard = () => {
    if (board.length === 0) return null;

    const tiles = [];
    for (let row = 0; row < ROWS; row++) {
      if (!board[row]) continue; // 행이 없으면 건너뛰기
      for (let col = 0; col < COLS; col++) {
        const cell = board[row]?.[col];
        if (!cell) continue; // 셀이 없으면 건너뛰기
        const isPlayer = playerPos.row === row && playerPos.col === col;
        const isNextTarget = gameState === 'playing' && cell.number === currentNumber && !isPlayer;
        const showHint = isNextTarget && visibleRange.length === 0 && hasSeenNumbers; // 숫자 봤다가 다시 숨겨졌을 때만!
        const isVisible = gameState === 'showing' || gameState === 'intro' || showNumbers || 
                         (cell.number !== null && visibleRange.includes(cell.number)) ||
                         cell.number === 0; // START는 항상 표시
        const isEmpty = cell.number === null;
        
        tiles.push(
          <div
            key={`${row}-${col}`}
            className={`
              ${isMobile ? 'w-12 h-12' : 'w-20 h-20'} flex items-center justify-center rounded-lg
              font-bold transition-all duration-300
              ${cell.number === 0 ? (isMobile ? 'text-[10px]' : 'text-sm') : (isMobile ? 'text-sm' : 'text-2xl')}
              ${isEmpty ? 'bg-transparent border-2 border-dashed border-gray-200/50' : 
                cell.number === 0 && isPlayer ? 'bg-gradient-to-br from-green-400 to-emerald-500 border-4 border-green-600 text-white scale-110 shadow-2xl shadow-green-500/50' :
                cell.number === 0 ? 'bg-gradient-to-br from-green-300 to-emerald-400 border-2 border-green-500 text-white shadow-lg' :
                isPlayer ? 'bg-gradient-to-br from-blue-500 to-purple-600 border-4 border-blue-700 text-white scale-110 shadow-2xl shadow-blue-500/50' : 
                showHint ? 'bg-gradient-to-br from-blue-200 to-purple-200 border-3 border-blue-400 animate-pulse-glow shadow-lg' :
                'bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 shadow-sm hover:shadow-md'}
              ${!isEmpty && !isVisible && !isPlayer ? 'text-transparent' : ''}
            `}
            style={{
              gridColumn: col + 1,
              gridRow: row + 1,
            }}
          >
            {isEmpty ? '' : (isVisible || isPlayer ? (cell.number === 0 ? 'START' : cell.number) : '?')}
          </div>
        );
      }
    }
    return tiles;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 애니메이션 효과 */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full mix-blend-overlay filter blur-3xl animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-yellow-200 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      {/* 헤더 - PC만 표시 */}
      {!isMobile && (
        <div className="mb-6 text-center relative z-10">
          <div className="inline-block mb-4">
            <div className="text-6xl animate-bounce">🧠</div>
          </div>
          <h1 className="text-5xl font-black text-white mb-3 drop-shadow-lg tracking-tight">
            Memory Path
          </h1>
          <p className="text-white text-lg font-medium drop-shadow-md">1부터 50까지 기억의 길을 찾아라! 🎯</p>
        </div>
      )}

      {/* 게임 정보 */}
      {gameState === 'playing' && (
        <div className={`${isMobile ? 'mb-2' : 'mb-4'} bg-white/95 backdrop-blur-sm rounded-xl md:rounded-2xl shadow-2xl px-3 md:px-8 py-2 md:py-4 border-2 border-white/50 relative z-10`}>
          <div className="flex items-center justify-between gap-3 md:gap-8">
            {isMobile ? (
              // 모바일: 간략화된 UI
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">목표</span>
                  <span className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {currentNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">⏱️</span>
                  <span className="text-xl font-black text-purple-600">{formatTime(elapsedTime)}</span>
                </div>
              </>
            ) : (
              // PC: 원래 UI
              <>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">다음 목표</p>
                  <p className="text-4xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {currentNumber}
                  </p>
                </div>
                <div className="text-right bg-gradient-to-br from-purple-50 to-pink-50 px-6 py-3 rounded-xl">
                  <p className="text-xs text-purple-600 font-semibold mb-1">⏱️ TIME</p>
                  <p className="text-3xl font-black text-purple-600">{formatTime(elapsedTime)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 게임 보드 */}
      <div 
        ref={boardRef}
        className={`relative bg-white/95 backdrop-blur-md rounded-2xl md:rounded-3xl shadow-2xl p-3 md:p-10 overflow-hidden transition-transform border-2 md:border-4 border-white/60 ${shakeBoard ? 'animate-shake' : ''}`}
        style={{ 
          width: 'fit-content',
          height: isMobile ? '350px' : '600px',
          overflow: 'hidden'
        }}
      >
        <div
          className={gameState === 'showing' ? '' : 'transition-transform duration-300 ease-out'}
          style={{
            transform: `translateY(-${scrollOffset}px)`
          }}
        >
          <div
            className="grid gap-1 md:gap-3"
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${isMobile ? '48px' : '80px'})`,
              gridTemplateRows: `repeat(${ROWS}, ${isMobile ? '48px' : '80px'})`
            }}
          >
            {renderBoard()}
          </div>
        </div>
      </div>

      {/* 인트로 화면 */}
      {gameState === 'intro' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl md:rounded-3xl p-8 md:p-12 text-center border-2 md:border-4 border-white/50 shadow-2xl max-w-md">
            <div className="text-6xl md:text-8xl mb-4 md:mb-6 animate-bounce">🧠</div>
            <h1 className="text-4xl md:text-6xl font-black mb-3 md:mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Memory Path
            </h1>
            <p className="text-lg md:text-2xl text-gray-600 font-bold mb-8 md:mb-10">
              1 → 50까지 기억의 길을 찾아라
            </p>
            <button
              onClick={startNewGame}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 active:scale-95 text-white font-black py-4 md:py-5 px-12 md:px-16 rounded-xl md:rounded-2xl text-2xl md:text-3xl transition-all transform hover:scale-110 shadow-xl hover:shadow-2xl"
            >
              시작하기
            </button>
          </div>
        </div>
      )}

      {/* 게임오버 화면 */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl md:rounded-3xl p-6 md:p-10 text-center max-w-md border-2 md:border-4 border-white/50 shadow-2xl">
            <div className="text-5xl md:text-7xl mb-3 md:mb-4">😢</div>
            <h2 className="text-3xl md:text-4xl font-black mb-4 md:mb-6 text-red-600">Game Over!</h2>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl md:rounded-2xl p-4 md:p-6 mb-4 md:mb-6">
              <p className="text-base md:text-lg text-gray-600 mb-2">도달한 숫자</p>
              <p className="text-5xl md:text-6xl font-black bg-gradient-to-r from-red-500 to-pink-600 bg-clip-text text-transparent mb-3">
                {currentNumber - 1}
              </p>
              <p className="text-xs md:text-sm text-gray-500">목표: 50</p>
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-300">
                <p className="text-xs md:text-sm text-gray-500">플레이 시간</p>
                <p className="text-xl md:text-2xl font-bold text-purple-600">⏱️ {formatTime(elapsedTime)}</p>
              </div>
            </div>
            <div className="flex gap-2 md:gap-3 justify-center">
              <button
                onClick={retryGame}
                className="bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 active:scale-95 text-white font-black py-2 md:py-3 px-6 md:px-8 rounded-lg md:rounded-xl text-base md:text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                🔄 다시
              </button>
              <button
                onClick={startNewGame}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 active:scale-95 text-white font-black py-2 md:py-3 px-6 md:px-8 rounded-lg md:rounded-xl text-base md:text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                🆕 새 맵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 게임 완료 화면 */}
      {gameState === 'complete' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl md:rounded-3xl p-8 md:p-12 text-center max-w-md border-2 md:border-4 border-white/50 shadow-2xl">
            <div className="text-6xl md:text-8xl mb-3 md:mb-4 animate-bounce">🎉</div>
            <h2 className="text-4xl md:text-5xl font-black mb-3 md:mb-4 bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
              완벽해요!
            </h2>
            <p className="text-xl md:text-2xl font-bold text-gray-700 mb-4 md:mb-6">
              50까지 모두 완주! ✨
            </p>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl md:rounded-2xl p-6 md:p-8 mb-4 md:mb-6 border-2 border-green-200">
              <p className="text-xs md:text-sm text-green-700 font-semibold mb-2">🏆 클리어 타임</p>
              <p className="text-4xl md:text-5xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {formatTime(completionTime)}
              </p>
            </div>
            <div className="flex gap-2 md:gap-3 justify-center">
              <button
                onClick={retryGame}
                className="bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 active:scale-95 text-white font-black py-2 md:py-3 px-6 md:px-8 rounded-lg md:rounded-xl text-base md:text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                🔄 다시
              </button>
              <button
                onClick={startNewGame}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 active:scale-95 text-white font-black py-2 md:py-3 px-6 md:px-8 rounded-lg md:rounded-xl text-base md:text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                🆕 새 맵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 십자 방향키 */}
      {isMobile && gameState === 'playing' && (
        <div className="mt-3 relative z-10">
          <div className="relative w-44 h-44 mx-auto">
            {/* 상 */}
            <button
              onClick={() => handleDirectionClick('up')}
              className="absolute top-0 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm active:bg-blue-500 active:text-white text-blue-600 font-bold w-14 h-14 rounded-t-xl transition-all shadow-lg active:shadow-2xl border-2 border-blue-200 active:scale-95 flex items-center justify-center text-2xl"
            >
              ▲
            </button>
            {/* 하 */}
            <button
              onClick={() => handleDirectionClick('down')}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm active:bg-blue-500 active:text-white text-blue-600 font-bold w-14 h-14 rounded-b-xl transition-all shadow-lg active:shadow-2xl border-2 border-blue-200 active:scale-95 flex items-center justify-center text-2xl"
            >
              ▼
            </button>
            {/* 좌 */}
            <button
              onClick={() => handleDirectionClick('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm active:bg-blue-500 active:text-white text-blue-600 font-bold w-14 h-14 rounded-l-xl transition-all shadow-lg active:shadow-2xl border-2 border-blue-200 active:scale-95 flex items-center justify-center text-2xl"
            >
              ◀
            </button>
            {/* 우 */}
            <button
              onClick={() => handleDirectionClick('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm active:bg-blue-500 active:text-white text-blue-600 font-bold w-14 h-14 rounded-r-xl transition-all shadow-lg active:shadow-2xl border-2 border-blue-200 active:scale-95 flex items-center justify-center text-2xl"
            >
              ▶
            </button>
            {/* 중앙 원 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full shadow-xl flex items-center justify-center">
              <div className="w-10 h-10 bg-white/30 rounded-full"></div>
            </div>
          </div>
        </div>
      )}

      {/* 재시작 버튼 - PC에서만 표시 */}
      {!isMobile && (gameState === 'playing' || gameState === 'showing') && (
        <div className="mt-4 flex gap-3 relative z-10">
          <button
            onClick={retryGame}
            className="bg-white/90 backdrop-blur-sm hover:bg-white text-orange-600 font-bold py-2 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl border-2 border-orange-200"
          >
            🔄 다시 도전
          </button>
          <button
            onClick={startNewGame}
            className="bg-white/90 backdrop-blur-sm hover:bg-white text-purple-600 font-bold py-2 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl border-2 border-purple-200"
          >
            🆕 새 맵
          </button>
        </div>
      )}
    </div>
  );
}
