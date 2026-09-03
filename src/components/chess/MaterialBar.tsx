'use client';

// Полоска с захваченными фигурами и материальным перевесом.
// Источник истины — текущая FEN-позиция: сравниваем количество фигур со «стартовым набором».
// Стартовый набор берётся из позиции, с которой начали партию: в турнире со своей
// расстановкой обычный комплект дал бы горы мнимых «съеденных» фигур.

import { PieceSvg } from '@/components/chess/PieceSvg';
import type { PieceCode } from '@/lib/piece';

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const INITIAL: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
// Порядок в выводе захваченных — от тяжёлых к лёгким.
const PIECE_ORDER: Array<keyof typeof PIECE_VALUE> = ['q', 'r', 'b', 'n', 'p'];

function countOnBoard(fen: string): Record<'w' | 'b', Record<string, number>> {
  const board = fen.split(' ')[0] ?? '';
  const counts: Record<'w' | 'b', Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  for (const ch of board) {
    if (ch === '/' || /[1-8]/.test(ch)) continue;
    const color: 'w' | 'b' = ch === ch.toUpperCase() ? 'w' : 'b';
    const type = ch.toLowerCase();
    if (counts[color][type] !== undefined) counts[color][type] += 1;
  }
  return counts;
}

/** Считает съеденные фигуры и материальный перевес обоих цветов. */
function computeMaterial(fen: string, startFen?: string) {
  const board = countOnBoard(fen);
  // Сколько фигур было в начале партии: обычный комплект или своя расстановка.
  const start = startFen ? countOnBoard(startFen) : null;
  const captured = {
    w: {} as Record<string, number>, // что белые СЪЕЛИ (т.е. недостающие у чёрных)
    b: {} as Record<string, number>,
  };
  let whiteValue = 0;
  let blackValue = 0;
  for (const type of PIECE_ORDER) {
    const wMissing = Math.max(0, (start ? start.b[type] : INITIAL[type]) - board.b[type]);
    const bMissing = Math.max(0, (start ? start.w[type] : INITIAL[type]) - board.w[type]);
    if (wMissing > 0) captured.w[type] = wMissing;
    if (bMissing > 0) captured.b[type] = bMissing;
    whiteValue += wMissing * PIECE_VALUE[type];
    blackValue += bMissing * PIECE_VALUE[type];
  }
  return {
    captured,
    diff: whiteValue - blackValue, // > 0 — преимущество белых, < 0 — чёрных
  };
}

interface Props {
  fen: string;
  /** Чьё «лицо» рисуем — для какого цвета показать съеденное им + его +N. */
  color: 'w' | 'b';
  /** Позиция начала партии. Без неё считаем от обычного комплекта фигур. */
  startFen?: string;
  className?: string;
  /** Компактный режим: маленькие иконки, без min-h, ничего не показываем если нет захватов. */
  compact?: boolean;
}

/** Маленькая полоска с захваченными фигурами и значком +N (если есть перевес). */
export function MaterialBar({ fen, color, startFen, className, compact }: Props) {
  const { captured, diff } = computeMaterial(fen, startFen);
  const mine = captured[color]; // что СЪЕЛ этот цвет
  const advantage = color === 'w' ? diff : -diff;

  const items: Array<{ type: string; count: number }> = [];
  for (const type of PIECE_ORDER) {
    const n = mine[type] ?? 0;
    if (n > 0) items.push({ type, count: n });
  }

  if (compact && items.length === 0 && advantage <= 0) return null;

  const sizePx = compact ? 18 : 24;
  const overlapPx = compact ? -7 : -10;

  return (
    <div
      className={`flex items-center gap-1 ${compact ? '' : 'min-h-[28px]'} ${className ?? ''}`}
      aria-label={`Захвачено игроком ${color === 'w' ? 'белых' : 'чёрных'}`}
    >
      {items.map(({ type, count }) => {
        // Захваченные фигуры рисуются в цвете СЪЕДЕННОЙ стороны (= противоположной).
        const oppColor: 'w' | 'b' = color === 'w' ? 'b' : 'w';
        const code = `${oppColor}${type}` as PieceCode;
        return (
          <div key={type} className="flex items-center">
            {Array.from({ length: count }).map((_, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center"
                style={{
                  width: sizePx,
                  height: sizePx,
                  marginLeft: i === 0 ? 0 : `${overlapPx}px`,
                }}
              >
                <PieceSvg code={code} className="h-full w-full" />
              </span>
            ))}
          </div>
        );
      })}
      {advantage > 0 && (
        <span
          className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
            color === 'w'
              ? 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-100'
              : 'bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-800'
          }`}
        >
          +{advantage}
        </span>
      )}
    </div>
  );
}
