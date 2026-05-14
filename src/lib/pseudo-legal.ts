/**
 * Псевдо-легальные ходы по доске без учёта шаха — для позиций,
 * где chess.js отказывается загружать FEN (нет короля и т.п.).
 * Также используется как fallback для подсказок.
 */

import { Chess, type Square as ChessSquare } from 'chess.js';
import type { PieceCode } from '@/lib/piece';
import {
  parseFen,
  setSideToMove,
  forceMove,
  getPiece,
  sideToMove as fenSideToMove,
  type Square,
} from '@/lib/fen';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function idx(r: number, c: number): string | null {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return `${FILES[c]}${8 - r}` as string;
}

function rawPieceAt(board: (PieceCode | null)[][], r: number, c: number): PieceCode | null {
  return board[r]?.[c] ?? null;
}

/** Сначала chess.js с очередью, выставленной под цвет фигуры на from — даёт полные легальные ходы с шахом. */
export function chessJsDestinationsIgnoringGlobalTurn(fen: string, from: Square): string[] {
  const parsed = parseFen(fen);
  const idxFrom = squareToRC(from);
  if (!idxFrom) return [];
  const piece = rawPieceAt(parsed.board, idxFrom.r, idxFrom.c);
  if (!piece) return [];
  try {
    const adj = setSideToMove(fen, piece[0] === 'w' ? 'w' : 'b');
    const g = new Chess(adj);
    const moves = g.moves({ square: from as ChessSquare, verbose: true }) as Array<{ to: string }>;
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
}

function squareToRC(sq: Square): { r: number; c: number } | null {
  const file = sq[0];
  const rank = Number(sq.slice(1));
  const c = FILES.indexOf(file as (typeof FILES)[number]);
  const r = 8 - rank;
  if (c < 0 || r < 0 || r > 7) return null;
  return { r, c };
}

const KNIGHT: [number, number][] = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];
const KING: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function addRay(
  board: (PieceCode | null)[][],
  r: number,
  c: number,
  color: 'w' | 'b',
  dr: number,
  dc: number,
  out: string[],
): void {
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
    const p = rawPieceAt(board, nr, nc);
    const sq = idx(nr, nc);
    if (!sq) break;
    if (!p) {
      out.push(sq);
    } else {
      if (p[0] !== color) out.push(sq);
      break;
    }
    nr += dr;
    nc += dc;
  }
}

/** Псевдо-легальные поля только по геометрии фигуры, без шаха и без рокировки. */
export function rawPieceDestinations(board: (PieceCode | null)[][], from: Square): string[] {
  const ix = squareToRC(from);
  if (!ix) return [];
  const { r, c } = ix;
  const piece = rawPieceAt(board, r, c);
  if (!piece) return [];
  const color = piece[0] as 'w' | 'b';
  const type = piece[1];
  const out: string[] = [];

  if (type === 'n') {
    for (const [dr, dc] of KNIGHT) {
      const nr = r + dr;
      const nc = c + dc;
      const sq = idx(nr, nc);
      if (!sq) continue;
      const p = rawPieceAt(board, nr, nc);
      if (!p || p[0] !== color) out.push(sq);
    }
    return out;
  }

  if (type === 'k') {
    for (const [dr, dc] of KING) {
      const nr = r + dr;
      const nc = c + dc;
      const sq = idx(nr, nc);
      if (!sq) continue;
      const p = rawPieceAt(board, nr, nc);
      if (!p || p[0] !== color) out.push(sq);
    }
    return out;
  }

  if (type === 'r' || type === 'q') {
    addRay(board, r, c, color, 1, 0, out);
    addRay(board, r, c, color, -1, 0, out);
    addRay(board, r, c, color, 0, 1, out);
    addRay(board, r, c, color, 0, -1, out);
  }
  if (type === 'b' || type === 'q') {
    addRay(board, r, c, color, 1, 1, out);
    addRay(board, r, c, color, 1, -1, out);
    addRay(board, r, c, color, -1, 1, out);
    addRay(board, r, c, color, -1, -1, out);
  }

  if (type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRank = color === 'w' ? 6 : 1;
    const fr = r + dir;
    if (fr >= 0 && fr <= 7) {
      if (!rawPieceAt(board, fr, c)) {
        const sq = idx(fr, c);
        if (sq) out.push(sq);
        if (r === startRank) {
          const fr2 = r + 2 * dir;
          if (fr2 >= 0 && fr2 <= 7 && !rawPieceAt(board, fr2, c)) {
            const sq2 = idx(fr2, c);
            if (sq2) out.push(sq2);
          }
        }
      }
    }
    for (const dc of [-1, 1]) {
      const fr = r + dir;
      const fc = c + dc;
      if (fr < 0 || fr > 7 || fc < 0 || fc > 7) continue;
      const p = rawPieceAt(board, fr, fc);
      if (p && p[0] !== color) {
        const sq = idx(fr, fc);
        if (sq) out.push(sq);
      }
    }
  }

  return out;
}

/** Объединение: chess.js при валидном FEN; иначе сырой генератор (нет королей и т.п.). */
export function allPseudoLegalDestinations(fen: string, from: Square): string[] {
  const fromChess = chessJsDestinationsIgnoringGlobalTurn(fen, from);
  const { board } = parseFen(fen);
  const ix = squareToRC(from);
  if (!ix) return [];
  const piece = rawPieceAt(board, ix.r, ix.c);
  if (!piece) return [];
  try {
    const adj = setSideToMove(fen, piece[0] === 'w' ? 'w' : 'b');
    new Chess(adj);
    return fromChess;
  } catch {
    return rawPieceDestinations(board, from);
  }
}

/** Применить ход без chess.js (после проверки allPseudoLegalDestinations). */
export function applyPseudoLegalMove(
  fen: string,
  from: Square,
  to: Square,
  promotion?: string,
): { fen: string; san: string } | null {
  if (!allPseudoLegalDestinations(fen, from).includes(to)) return null;
  const piece = getPiece(fen, from);
  if (!piece) return null;
  const tr = Number(to[1]);
  const needsPromo =
    piece[1] === 'p' &&
    ((piece[0] === 'w' && tr === 8) || (piece[0] === 'b' && tr === 1));
  const promo = needsPromo
    ? (((promotion ?? 'q').toLowerCase() as 'q' | 'r' | 'b' | 'n') &&
      ['q', 'r', 'b', 'n'].includes((promotion ?? 'q').toLowerCase())
      ? ((promotion ?? 'q').toLowerCase() as 'q' | 'r' | 'b' | 'n')
      : 'q')
    : undefined;
  const out = forceMove(fen, from, to, promo);
  if (!out.piece) return null;
  let next = out.fen;
  const was = fenSideToMove(fen);
  next = setSideToMove(next, was === 'w' ? 'b' : 'w');
  const san = `${from}-${to}${out.promoted ? '=' + String(promo ?? 'q').toUpperCase() : ''}`;
  return { fen: next, san };
}
