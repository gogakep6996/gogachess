'use client';

// Список партий: идущие сейчас (для трансляции) и сыгранные (для разбора).
// Клик открывает партию на доске рядом.

import { CaretRight } from '@phosphor-icons/react';

import type { ArenaGameSummaryDto } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

/** Короткий итог для строки списка. */
function outcomeLabel(status: string): string {
  if (status === 'live') return 'идёт';
  if (status === 'white') return '1 : 0';
  if (status === 'black') return '0 : 1';
  if (status === 'draw') return '½ : ½';
  return 'отменена';
}

export function GamesList({
  games,
  activeId,
  onOpen,
  emptyHint,
}: {
  games: ArenaGameSummaryDto[];
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
    <ul className="divide-y divide-stone-900/[0.05] dark:divide-white/[0.05]">
      {games.map((g) => {
        const active = g.id === activeId;
        return (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onOpen(g.id)}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
                active
                  ? 'bg-brand-50/80 dark:bg-brand-900/50'
                  : 'hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.05]',
              )}
            >
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-medium text-stone-800 dark:text-stone-100">
                  {g.whiteName}
                </span>
                <span className="block truncate text-[12.5px] text-stone-600 dark:text-stone-300">
                  {g.blackName}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-stone-500 dark:text-stone-400">
                {outcomeLabel(g.status)}
              </span>
              <CaretRight
                size={13}
                weight="bold"
                aria-hidden
                className="shrink-0 text-stone-300 dark:text-stone-600"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
