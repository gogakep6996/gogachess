'use client';

// Мини-доски идущих партий — для зрителей, тренера и игроков на паузе,
// как «Now playing» на Lichess. Позиции обновляются сами: сервер шлёт
// свежий FEN каждой партии в снэпшоте арены. Клик по доске раскрывает
// партию в центре страницы на полный размер, с перемоткой ходов.

import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ArenaGameSummaryDto } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

export function LiveBoards({
  games,
  activeId,
  onOpen,
  emptyHint,
}: {
  games: ArenaGameSummaryDto[];
  /** Партия, которая сейчас раскрыта в центре. */
  activeId: string | null;
  onOpen: (gameId: string) => void;
  emptyHint: string;
}) {
  if (games.length === 0) {
    return (
      <p className="px-2.5 py-6 text-center text-[12px] leading-snug text-stone-400 dark:text-stone-500">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-1.5 p-1.5">
      {games.map((g) => {
        const active = g.id === activeId;
        return (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onOpen(g.id)}
              aria-label={`Смотреть партию ${g.whiteName} против ${g.blackName}`}
              className={cn(
                'block w-full rounded-xl p-1.5 text-left transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
                active
                  ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-800'
                  : 'hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.05]',
              )}
            >
              {/* Доска показана со стороны белых: чёрные сверху, белые снизу. */}
              <span className="block truncate text-[11px] font-medium text-stone-600 dark:text-stone-300">
                {g.blackName}
              </span>
              <span className="pointer-events-none mt-1 block aspect-square w-full overflow-hidden rounded-md ring-1 ring-stone-900/[0.07] dark:ring-white/[0.08]">
                <ChessBoard
                  fen={g.fen}
                  canMove={false}
                  isEditing={false}
                  canEdit={false}
                  compact
                  fillContainer
                  silent
                />
              </span>
              <span className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-stone-800 dark:text-stone-100">
                  {g.whiteName}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
                  {g.movesCount}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
