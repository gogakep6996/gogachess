// Утилиты для свободного редактора: меняют только placement-часть FEN,
// без валидации позиции. Это нужно потому, что в момент редактирования
// у учителя может быть временно «нелегальная» позиция (нет короля,
// две пешки на одной вертикали и т.п.) — итоговую позицию валидирует
// сервер при нажатии «Продолжить».

import type { PieceCode } from '@/lib/piece';

export type Square = `${string}${number}`;

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

interface ParsedFen {
  board: (PieceCode | null)[][]; // [row 0 = rank 8] [col 0 = file a]
  rest: string;
}

export function parseFen(fen: string): ParsedFen {
  const [placement, ...rest] = fen.split(' ');
  const ranks = placement.split('/');
  const board: (PieceCode | null)[][] = [];
  for (const rank of ranks) {
    const row: (PieceCode | null)[] = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        const isWhite = ch === ch.toUpperCase();
        const code = `${isWhite ? 'w' : 'b'}${ch.toLowerCase()}` as PieceCode;
        row.push(code);
      }
    }
    while (row.length < 8) row.push(null);
    board.push(row);
  }
  while (board.length < 8) board.push(Array(8).fill(null));
  return { board, rest: rest.join(' ') || 'w - - 0 1' };
}

export function stringifyFen({ board, rest }: ParsedFen): string {
  const ranks = board.map((row) => {
    let out = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) {
        empty++;
      } else {
        if (empty) {
          out += String(empty);
          empty = 0;
        }
        const ch = cell[1];
        out += cell[0] === 'w' ? ch.toUpperCase() : ch.toLowerCase();
      }
    }
    if (empty) out += String(empty);
    return out;
  });
  return `${ranks.join('/')} ${rest}`;
}

function squareToIdx(sq: Square): { row: number; col: number } | null {
  const file = sq[0];
  const rank = Number(sq.slice(1));
  const col = FILES.indexOf(file as (typeof FILES)[number]);
  const row = 8 - rank;
  if (col < 0 || row < 0 || row > 7) return null;
  return { row, col };
}

export function setPiece(fen: string, sq: Square, piece: PieceCode | null): string {
  const parsed = parseFen(fen);
  const idx = squareToIdx(sq);
  if (!idx) return fen;
  parsed.board[idx.row][idx.col] = piece;
  return stringifyFen(parsed);
}

export function getPiece(fen: string, sq: Square): PieceCode | null {
  const parsed = parseFen(fen);
  const idx = squareToIdx(sq);
  if (!idx) return null;
  return parsed.board[idx.row][idx.col];
}

export function emptyFen(): string {
  return '8/8/8/8/8/8/8/8 w - - 0 1';
}

/** Возвращает сторону, которая должна ходить (`w` или `b`). */
export function sideToMove(fen: string): 'w' | 'b' {
  const parts = fen.split(' ');
  return parts[1] === 'b' ? 'b' : 'w';
}

/** Меняет сторону хода в FEN, сохраняя остальные поля. */
export function flipSide(fen: string): string {
  return setSideToMove(fen, sideToMove(fen) === 'w' ? 'b' : 'w');
}

/** Принудительно устанавливает указанную сторону хода. */
export function setSideToMove(fen: string, side: 'w' | 'b'): string {
  const parts = fen.split(' ');
  if (parts.length < 2) return `${parts[0] ?? emptyFen().split(' ')[0]} ${side} - - 0 1`;
  parts[1] = side;
  // Сбрасываем en-passant — он был релевантен только для прежней стороны.
  if (parts[3] && parts[3] !== '-') parts[3] = '-';
  return parts.join(' ');
}

/** «Силовой» ход без валидации правил: переносит фигуру с from на to,
 *  опционально превращая пешку. Используется в свободном режиме комнаты. */
export function forceMove(
  fen: string,
  from: Square,
  to: Square,
  promotion?: 'q' | 'r' | 'b' | 'n',
): { fen: string; promoted: boolean; piece: PieceCode | null } {
  const piece = getPiece(fen, from);
  if (!piece) return { fen, promoted: false, piece: null };
  let next = setPiece(fen, from, null);
  let placed: PieceCode = piece;
  const targetRank = Number(to[1]);
  const isPawn = piece[1] === 'p';
  const reachesEnd =
    isPawn && ((piece[0] === 'w' && targetRank === 8) || (piece[0] === 'b' && targetRank === 1));
  let promoted = false;
  if (reachesEnd) {
    const p = (promotion ?? 'q').toLowerCase();
    const target = (['q', 'r', 'b', 'n'].includes(p) ? p : 'q') as 'q' | 'r' | 'b' | 'n';
    placed = `${piece[0]}${target}` as PieceCode;
    promoted = true;
  }
  next = setPiece(next, to, placed);
  return { fen: next, promoted, piece: placed };
}
