import type { AiDifficulty, CellMark, PlayerSide } from "@/types/game";

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

interface Resolution {
  winner: PlayerSide | null;
  winningLine: number[] | null;
  isDraw: boolean;
}

function otherSide(side: PlayerSide): PlayerSide {
  return side === "x" ? "o" : "x";
}

function availableMoves(board: CellMark[]): number[] {
  return board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
}

export function resolveBoard(board: CellMark[]): Resolution {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return {
        winner: board[a],
        winningLine: line,
        isDraw: false
      };
    }
  }

  const isDraw = board.every((cell) => cell !== null);
  return {
    winner: null,
    winningLine: null,
    isDraw
  };
}

export function randomMove(board: CellMark[]): number {
  const moves = availableMoves(board);
  if (!moves.length) return -1;
  return moves[Math.floor(Math.random() * moves.length)];
}

function minimax(board: CellMark[], aiSide: PlayerSide, currentSide: PlayerSide): number {
  const state = resolveBoard(board);
  if (state.winner === aiSide) return 10;
  if (state.winner === otherSide(aiSide)) return -10;
  if (state.isDraw) return 0;

  const moves = availableMoves(board);
  if (currentSide === aiSide) {
    let best = -Infinity;
    for (const move of moves) {
      const nextBoard = [...board];
      nextBoard[move] = currentSide;
      const score = minimax(nextBoard, aiSide, otherSide(currentSide));
      best = Math.max(best, score);
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const nextBoard = [...board];
    nextBoard[move] = currentSide;
    const score = minimax(nextBoard, aiSide, otherSide(currentSide));
    best = Math.min(best, score);
  }
  return best;
}

export function bestMove(board: CellMark[], aiSide: PlayerSide): number {
  const moves = availableMoves(board);
  let bestScore = -Infinity;
  let bestChoice = -1;

  for (const move of moves) {
    const nextBoard = [...board];
    nextBoard[move] = aiSide;
    const score = minimax(nextBoard, aiSide, otherSide(aiSide));
    if (score > bestScore) {
      bestScore = score;
      bestChoice = move;
    }
  }

  return bestChoice;
}

export function chooseAiMove(board: CellMark[], aiSide: PlayerSide, difficulty: AiDifficulty): number {
  if (difficulty === "pre_almoco") return randomMove(board);
  return bestMove(board, aiSide);
}

export function classifyAiMove(boardBefore: CellMark[], aiMove: number, aiSide: PlayerSide): "good" | "bad" {
  if (aiMove < 0) return "bad";

  const winningTry = [...boardBefore];
  winningTry[aiMove] = aiSide;
  const wonNow = resolveBoard(winningTry).winner === aiSide;
  if (wonNow) return "good";

  const rival = otherSide(aiSide);
  for (const candidate of availableMoves(boardBefore)) {
    const rivalTry = [...boardBefore];
    rivalTry[candidate] = rival;
    if (resolveBoard(rivalTry).winner === rival && candidate === aiMove) {
      return "good";
    }
  }

  return Math.random() > 0.55 ? "good" : "bad";
}

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function generateProtocolCode(): string {
  const value = Math.floor(1000 + Math.random() * 9000);
  return `DFGF-${value}`;
}
