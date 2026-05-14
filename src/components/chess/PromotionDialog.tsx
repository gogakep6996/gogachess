'use client';

import { PieceSvg, type PieceCode } from './PieceSvg';
import { cn } from '@/lib/utils';

type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface Props {
  /** Цвет пешки, которая ходит на последний ряд. */
  color: 'w' | 'b';
  onChoose: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const PIECES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const LABELS: Record<PromotionPiece, string> = {
  q: 'Ферзь',
  r: 'Ладья',
  b: 'Слон',
  n: 'Конь',
};

export function PromotionDialog({ color, onChoose, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-stone-950/55 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label="Выберите фигуру для превращения"
        className="w-full max-w-sm rounded-2xl border border-stone-200/80 bg-white p-4 shadow-glow dark:border-stone-700/60 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-center text-base font-semibold">
          Превратить пешку в…
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {PIECES.map((p) => {
            const code = `${color}${p}` as PieceCode;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChoose(p)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-3 transition',
                  'hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 hover:shadow-soft',
                  'dark:border-stone-700 dark:bg-stone-800 dark:hover:border-brand-500 dark:hover:bg-stone-700/60',
                )}
              >
                <PieceSvg code={code} className="h-10 w-10" />
                <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
                  {LABELS[p]}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost mt-3 w-full text-xs"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
