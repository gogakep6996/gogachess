'use client';

import { PieceSvg, type PieceCode } from './PieceSvg';
import { parseFen } from '@/lib/fen';
import { STARTING_FEN } from '@/lib/socket-events';

interface Props {
  fen?: string;
  size?: number;
  flipped?: boolean;
}

export function MiniBoard({ fen = STARTING_FEN, size = 140, flipped = false }: Props) {
  let board: (PieceCode | null)[][];
  try {
    board = parseFen(fen).board;
  } catch {
    board = parseFen(STARTING_FEN).board;
  }
  const rows = flipped ? [...board].reverse().map((r) => [...r].reverse()) : board;

  return (
    <div
      className="grid overflow-hidden rounded-md border border-brand-200/60 shadow-sm dark:border-stone-700/60"
      style={{ width: size, height: size, gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
    >
      {rows.map((row, ri) =>
        row.map((cell, ci) => {
          const light = (ri + ci) % 2 === 0;
          return (
            <div
              key={`${ri}-${ci}`}
              className="relative flex items-center justify-center"
              style={{ backgroundColor: light ? '#f0d9b5' : '#b58863' }}
            >
              {cell && <PieceSvg code={cell} className="h-[88%] w-[88%]" />}
            </div>
          );
        }),
      )}
    </div>
  );
}
