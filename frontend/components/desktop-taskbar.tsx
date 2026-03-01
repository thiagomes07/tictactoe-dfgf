"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

type AppId = "calculator" | "snake";

interface AppWindowState {
  open: boolean;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface Direction {
  x: number;
  y: number;
}

interface SnakeState {
  snake: number[];
  direction: Direction;
  queuedDirection: Direction;
  food: number;
  score: number;
  running: boolean;
  gameOver: boolean;
}

const TASKBAR_HEIGHT = 38;
const SNAKE_COLS = 20;
const SNAKE_ROWS = 14;
const SNAKE_TOTAL = SNAKE_COLS * SNAKE_ROWS;
const RIGHT: Direction = { x: 1, y: 0 };
const LEFT: Direction = { x: -1, y: 0 };
const UP: Direction = { x: 0, y: -1 };
const DOWN: Direction = { x: 0, y: 1 };

const WINDOW_PRESETS: Record<AppId, Omit<AppWindowState, "open" | "minimized" | "zIndex">> = {
  calculator: {
    x: 44,
    y: 110,
    width: 264,
    height: 344
  },
  snake: {
    x: 340,
    y: 104,
    width: 440,
    height: 420
  }
};

function clockLabel(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function routeLabel(pathname: string, mode: string | null): string {
  if (pathname === "/jogo" && mode === "pvp_remote") return "Salas de Protocolo";
  if (pathname === "/jogo") return "Formulário 3x3-B";
  if (pathname === "/sala") return "Salas de Protocolo";
  if (pathname === "/arquivo-morto") return "Arquivo Morto";
  return "Abertura de Processo";
}

function routeIcon(pathname: string, mode: string | null): string {
  if (pathname === "/jogo" && mode === "pvp_remote") return "taskbar-icon-network";
  if (pathname === "/jogo") return "taskbar-icon-board";
  if (pathname === "/sala") return "taskbar-icon-network";
  if (pathname === "/arquivo-morto") return "taskbar-icon-folder";
  return "taskbar-icon-home";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function compute(accumulator: number, current: number, operator: string): number {
  if (operator === "+") return accumulator + current;
  if (operator === "-") return accumulator - current;
  if (operator === "*") return accumulator * current;
  if (operator === "/") {
    if (current === 0) return 0;
    return accumulator / current;
  }
  return current;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(8));
  return String(rounded);
}

function randomFreeCell(snake: number[]): number {
  const blocked = new Set(snake);
  const candidates: number[] = [];
  for (let i = 0; i < SNAKE_TOTAL; i += 1) {
    if (!blocked.has(i)) candidates.push(i);
  }
  if (candidates.length === 0) return 0;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function makeInitialSnakeState(): SnakeState {
  const center = Math.floor(SNAKE_COLS / 2) + Math.floor(SNAKE_ROWS / 2) * SNAKE_COLS;
  const snake = [center, center - 1, center - 2];
  return {
    snake,
    direction: RIGHT,
    queuedDirection: RIGHT,
    food: randomFreeCell(snake),
    score: 0,
    running: true,
    gameOver: false
  };
}

function isOppositeDirection(a: Direction, b: Direction): boolean {
  return a.x === -b.x && a.y === -b.y;
}

export function DesktopTaskbar() {
  const pathname = usePathname();
  const [mode, setMode] = useState<string | null>(null);
  const [clock, setClock] = useState(() => clockLabel(new Date()));
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [windows, setWindows] = useState<Record<AppId, AppWindowState>>(() => ({
    calculator: { ...WINDOW_PRESETS.calculator, open: false, minimized: false, zIndex: 20 },
    snake: { ...WINDOW_PRESETS.snake, open: false, minimized: false, zIndex: 21 }
  }));

  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcAccumulator, setCalcAccumulator] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcReplace, setCalcReplace] = useState(false);

  const [snakeState, setSnakeState] = useState<SnakeState>(() => makeInitialSnakeState());

  const zCounterRef = useRef(40);
  const dragRef = useRef<{
    appId: AppId;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(clockLabel(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = params.get("mode");
    setMode((current) => (current === nextMode ? current : nextMode));
  });

  const bringToFront = (appId: AppId) => {
    setWindows((prev) => {
      const nextZ = zCounterRef.current + 1;
      zCounterRef.current = nextZ;
      return {
        ...prev,
        [appId]: {
          ...prev[appId],
          zIndex: nextZ
        }
      };
    });
    setActiveApp(appId);
  };

  const openOrToggleWindow = (appId: AppId) => {
    setWindows((prev) => {
      const current = prev[appId];
      const nextZ = zCounterRef.current + 1;
      zCounterRef.current = nextZ;

      if (!current.open) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = Math.min(current.width, Math.max(220, viewportWidth - 20));
        const height = Math.min(current.height, Math.max(220, viewportHeight - TASKBAR_HEIGHT - 16));
        const x = clamp(current.x, 8, Math.max(8, viewportWidth - width - 8));
        const y = clamp(current.y, 8, Math.max(8, viewportHeight - TASKBAR_HEIGHT - height - 8));

        return {
          ...prev,
          [appId]: {
            ...current,
            width,
            height,
            x,
            y,
            open: true,
            minimized: false,
            zIndex: nextZ
          }
        };
      }

      if (current.minimized) {
        return {
          ...prev,
          [appId]: {
            ...current,
            minimized: false,
            zIndex: nextZ
          }
        };
      }

      return {
        ...prev,
        [appId]: {
          ...current,
          minimized: true
        }
      };
    });

    if (appId === "snake" && !windows.snake.open) {
      setSnakeState(makeInitialSnakeState());
    }

    setActiveApp((prev) => (prev === appId ? null : appId));
  };

  const minimizeWindow = (appId: AppId) => {
    setWindows((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        minimized: true
      }
    }));
    if (activeApp === appId) setActiveApp(null);
  };

  const closeWindow = (appId: AppId) => {
    setWindows((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        open: false,
        minimized: false
      }
    }));
    if (activeApp === appId) setActiveApp(null);

    if (appId === "calculator") {
      setCalcDisplay("0");
      setCalcAccumulator(null);
      setCalcOperator(null);
      setCalcReplace(false);
    }
    if (appId === "snake") {
      setSnakeState(makeInitialSnakeState());
    }
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) return;

      const { appId, offsetX, offsetY } = dragRef.current;
      setWindows((prev) => {
        const current = prev[appId];
        const maxX = window.innerWidth - current.width - 10;
        const maxY = window.innerHeight - TASKBAR_HEIGHT - current.height - 8;

        return {
          ...prev,
          [appId]: {
            ...current,
            x: clamp(event.clientX - offsetX, 8, Math.max(8, maxX)),
            y: clamp(event.clientY - offsetY, 8, Math.max(8, maxY))
          }
        };
      });
    };

    const onMouseUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleTitleMouseDown = (appId: AppId, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    bringToFront(appId);
    const current = windows[appId];
    dragRef.current = {
      appId,
      offsetX: event.clientX - current.x,
      offsetY: event.clientY - current.y
    };
  };

  const calcInputDigit = (digit: string) => {
    setCalcDisplay((prev) => {
      if (calcReplace) return digit;
      if (prev === "0") return digit;
      return prev + digit;
    });
    setCalcReplace(false);
  };

  const calcInputDot = () => {
    setCalcDisplay((prev) => {
      if (calcReplace) return "0.";
      if (prev.includes(".")) return prev;
      return `${prev}.`;
    });
    setCalcReplace(false);
  };

  const calcClear = () => {
    setCalcDisplay("0");
    setCalcAccumulator(null);
    setCalcOperator(null);
    setCalcReplace(false);
  };

  const calcToggleSign = () => {
    setCalcDisplay((prev) => {
      if (prev === "0") return prev;
      return prev.startsWith("-") ? prev.slice(1) : `-${prev}`;
    });
  };

  const calcPercent = () => {
    const current = Number(calcDisplay);
    setCalcDisplay(formatNumber(current / 100));
    setCalcReplace(true);
  };

  const calcApplyOperator = (operator: string) => {
    const current = Number(calcDisplay);
    if (calcAccumulator === null) {
      setCalcAccumulator(current);
      setCalcOperator(operator);
      setCalcReplace(true);
      return;
    }

    if (!calcOperator) {
      setCalcAccumulator(current);
      setCalcOperator(operator);
      setCalcReplace(true);
      return;
    }

    const result = compute(calcAccumulator, current, calcOperator);
    setCalcDisplay(formatNumber(result));
    setCalcAccumulator(result);
    setCalcOperator(operator);
    setCalcReplace(true);
  };

  const calcEquals = () => {
    if (calcAccumulator === null || !calcOperator) return;
    const current = Number(calcDisplay);
    const result = compute(calcAccumulator, current, calcOperator);
    setCalcDisplay(formatNumber(result));
    setCalcAccumulator(result);
    setCalcOperator(null);
    setCalcReplace(true);
  };

  useEffect(() => {
    if (!windows.snake.open || windows.snake.minimized || activeApp !== "snake") return;

    const onKeyDown = (event: KeyboardEvent) => {
      let nextDirection: Direction | null = null;
      if (event.key === "ArrowUp") nextDirection = UP;
      if (event.key === "ArrowDown") nextDirection = DOWN;
      if (event.key === "ArrowLeft") nextDirection = LEFT;
      if (event.key === "ArrowRight") nextDirection = RIGHT;
      if (!nextDirection) return;

      event.preventDefault();
      setSnakeState((prev) => {
        if (isOppositeDirection(nextDirection as Direction, prev.direction)) return prev;
        return {
          ...prev,
          queuedDirection: nextDirection as Direction,
          running: prev.running || !prev.gameOver
        };
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeApp, windows.snake.minimized, windows.snake.open]);

  useEffect(() => {
    if (!windows.snake.open || windows.snake.minimized || !snakeState.running || snakeState.gameOver) return;

    const timer = window.setInterval(() => {
      setSnakeState((prev) => {
        if (!prev.running || prev.gameOver) return prev;

        const direction = prev.queuedDirection;
        const head = prev.snake[0];
        const headX = head % SNAKE_COLS;
        const headY = Math.floor(head / SNAKE_COLS);
        const nextX = headX + direction.x;
        const nextY = headY + direction.y;

        if (nextX < 0 || nextY < 0 || nextX >= SNAKE_COLS || nextY >= SNAKE_ROWS) {
          return {
            ...prev,
            direction,
            queuedDirection: direction,
            running: false,
            gameOver: true
          };
        }

        const nextHead = nextY * SNAKE_COLS + nextX;
        const willGrow = nextHead === prev.food;
        const occupiedCells = willGrow ? prev.snake : prev.snake.slice(0, -1);
        if (occupiedCells.includes(nextHead)) {
          return {
            ...prev,
            direction,
            queuedDirection: direction,
            running: false,
            gameOver: true
          };
        }

        const nextSnake = [nextHead, ...prev.snake];
        if (!willGrow) {
          nextSnake.pop();
        }

        let score = prev.score;
        let food = prev.food;
        if (willGrow) {
          score += 1;
          food = randomFreeCell(nextSnake);
        }

        return {
          ...prev,
          snake: nextSnake,
          direction,
          queuedDirection: direction,
          score,
          food
        };
      });
    }, 130);

    return () => window.clearInterval(timer);
  }, [snakeState.gameOver, snakeState.running, windows.snake.minimized, windows.snake.open]);

  const snakeToggle = () => {
    setSnakeState((prev) => {
      if (prev.gameOver) return makeInitialSnakeState();
      return {
        ...prev,
        running: !prev.running
      };
    });
  };

  const snakeReset = () => {
    setSnakeState(makeInitialSnakeState());
  };

  const activeLabel = useMemo(() => routeLabel(pathname, mode), [mode, pathname]);
  const activeIcon = useMemo(() => routeIcon(pathname, mode), [mode, pathname]);

  const calcButtons = [
    { label: "CE", onClick: calcClear, className: "desktop-calc-op" },
    { label: "+/-", onClick: calcToggleSign, className: "desktop-calc-op" },
    { label: "%", onClick: calcPercent, className: "desktop-calc-op" },
    { label: "/", onClick: () => calcApplyOperator("/"), className: "desktop-calc-op" },
    { label: "7", onClick: () => calcInputDigit("7") },
    { label: "8", onClick: () => calcInputDigit("8") },
    { label: "9", onClick: () => calcInputDigit("9") },
    { label: "*", onClick: () => calcApplyOperator("*"), className: "desktop-calc-op" },
    { label: "4", onClick: () => calcInputDigit("4") },
    { label: "5", onClick: () => calcInputDigit("5") },
    { label: "6", onClick: () => calcInputDigit("6") },
    { label: "-", onClick: () => calcApplyOperator("-"), className: "desktop-calc-op" },
    { label: "1", onClick: () => calcInputDigit("1") },
    { label: "2", onClick: () => calcInputDigit("2") },
    { label: "3", onClick: () => calcInputDigit("3") },
    { label: "+", onClick: () => calcApplyOperator("+"), className: "desktop-calc-op" },
    { label: "0", onClick: () => calcInputDigit("0"), className: "desktop-calc-zero" },
    { label: ".", onClick: calcInputDot },
    { label: "=", onClick: calcEquals, className: "desktop-calc-equals" }
  ];

  return (
    <>
      <div className="desktop-app-layer" aria-hidden="false">
        {windows.calculator.open && !windows.calculator.minimized ? (
          <section
            className={`desktop-app-window ${activeApp === "calculator" ? "" : "desktop-app-window-inactive"}`}
            style={{
              left: windows.calculator.x,
              top: windows.calculator.y,
              width: windows.calculator.width,
              height: windows.calculator.height,
              zIndex: windows.calculator.zIndex
            }}
            onMouseDown={() => bringToFront("calculator")}
          >
            <header
              className={`desktop-app-titlebar ${activeApp === "calculator" ? "" : "desktop-app-titlebar-inactive"}`}
              onMouseDown={(event) => handleTitleMouseDown("calculator", event)}
            >
              <span>Calculadora DFGF</span>
              <div className="desktop-app-controls">
                <button
                  type="button"
                  className="window-control"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => minimizeWindow("calculator")}
                  aria-label="Minimizar calculadora"
                >
                  _
                </button>
                <button
                  type="button"
                  className="window-control"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => closeWindow("calculator")}
                  aria-label="Fechar calculadora"
                >
                  x
                </button>
              </div>
            </header>

            <div className="desktop-app-body desktop-calc-body">
              <div className="desktop-calc-display">{calcDisplay}</div>
              <div className="desktop-calc-grid">
                {calcButtons.map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    className={`action-btn desktop-calc-btn ${button.className ?? ""}`}
                    onClick={button.onClick}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {windows.snake.open && !windows.snake.minimized ? (
          <section
            className={`desktop-app-window ${activeApp === "snake" ? "" : "desktop-app-window-inactive"}`}
            style={{
              left: windows.snake.x,
              top: windows.snake.y,
              width: windows.snake.width,
              height: windows.snake.height,
              zIndex: windows.snake.zIndex
            }}
            onMouseDown={() => bringToFront("snake")}
          >
            <header
              className={`desktop-app-titlebar ${activeApp === "snake" ? "" : "desktop-app-titlebar-inactive"}`}
              onMouseDown={(event) => handleTitleMouseDown("snake", event)}
            >
              <span>Snake 95</span>
              <div className="desktop-app-controls">
                <button
                  type="button"
                  className="window-control"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => minimizeWindow("snake")}
                  aria-label="Minimizar snake"
                >
                  _
                </button>
                <button
                  type="button"
                  className="window-control"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => closeWindow("snake")}
                  aria-label="Fechar snake"
                >
                  x
                </button>
              </div>
            </header>

            <div className="desktop-app-body desktop-snake-body">
              <div className="desktop-snake-top">
                <span>Pontuação: {snakeState.score}</span>
                <span>{snakeState.gameOver ? "Fim de jogo" : snakeState.running ? "Rodando" : "Pausado"}</span>
              </div>

              <div
                className="desktop-snake-board"
                style={{ gridTemplateColumns: `repeat(${SNAKE_COLS}, 1fr)` }}
                onClick={() => setActiveApp("snake")}
              >
                {Array.from({ length: SNAKE_TOTAL }).map((_, index) => {
                  const isHead = snakeState.snake[0] === index;
                  const isBody = !isHead && snakeState.snake.includes(index);
                  const isFood = snakeState.food === index;
                  return (
                    <div
                      key={index}
                      className={`desktop-snake-cell ${isHead ? "desktop-snake-head" : ""} ${isBody ? "desktop-snake-segment" : ""} ${isFood ? "desktop-snake-food" : ""}`}
                    />
                  );
                })}
              </div>

              <div className="desktop-snake-controls">
                <button type="button" className="action-btn" onClick={snakeToggle}>
                  {snakeState.running && !snakeState.gameOver ? "Pausar" : snakeState.gameOver ? "Reiniciar" : "Iniciar"}
                </button>
                <button type="button" className="action-btn" onClick={snakeReset}>
                  Novo jogo
                </button>
                <span className="desktop-snake-hint">Use as setas do teclado</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <footer className="taskbar" role="contentinfo" aria-label="Barra de tarefas DFGF">
        <Link href="/" className="taskbar-start" data-win-tooltip="Retornar ao inicio">
          DFGF
        </Link>

        <div className="taskbar-active" aria-live="polite">
          <span className={`taskbar-icon ${activeIcon}`} aria-hidden="true" />
          <span>{activeLabel}</span>
        </div>

        <div className="taskbar-launchers">
          <button
            type="button"
            className={`taskbar-app-btn ${windows.calculator.open && !windows.calculator.minimized ? "taskbar-app-btn-active" : ""}`}
            data-win-tooltip="Calculadora"
            onClick={() => openOrToggleWindow("calculator")}
          >
            <span className="taskbar-icon taskbar-icon-calc" aria-hidden="true" />
            <span>Calc</span>
          </button>

          <button
            type="button"
            className={`taskbar-app-btn ${windows.snake.open && !windows.snake.minimized ? "taskbar-app-btn-active" : ""}`}
            data-win-tooltip="Snake"
            onClick={() => openOrToggleWindow("snake")}
          >
            <span className="taskbar-icon taskbar-icon-snake" aria-hidden="true" />
            <span>Snake</span>
          </button>
        </div>

        <div className="taskbar-clock">{clock}</div>
      </footer>
    </>
  );
}
