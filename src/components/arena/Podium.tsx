'use client';

// Подиум завершённой арены: второе место слева, первое в середине, третье справа.
// Высота ступеней разная, поэтому порядок читается без цифр и подписей.

import { Trophy } from '@phosphor-icons/react';

import type { ArenaStandingDto } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

const STEP = [
  { place: 2, height: 'h-16', order: 'order-1' },
  { place: 1, height: 'h-24', order: 'order-2' },
  { place: 3, height: 'h-12', order: 'order-3' },
] as const;

export function Podium({ standings }: { standings: ArenaStandingDto[] }) {
  const top = standings.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {STEP.map(({ place, height, order }) => {
        const row = top.find((s) => s.rank === place);
        if (!row) return null;
        const first = place === 1;
        return (
          <div key={place} className={cn('flex w-24 flex-col items-center sm:w-32', order)}>
            {first && (
              <Trophy
                size={22}
                weight="fill"
                aria-hidden
                className="mb-1 text-amber-500 dark:text-amber-400"
              />
            )}
            <span
              className="w-full truncate text-center text-[13px] font-semibold text-stone-800 dark:text-stone-100"
              title={row.name}
            >
              {row.name}
            </span>
            <span className="text-[12px] tabular-nums text-stone-500 dark:text-stone-400">
              {row.score} очк.
            </span>
            <div
              className={cn(
                'mt-1.5 grid w-full place-items-center rounded-t-xl',
                height,
                first
                  ? 'bg-brand-600/15 ring-1 ring-inset ring-brand-600/25 dark:bg-brand-400/15 dark:ring-brand-400/25'
                  : 'bg-stone-900/[0.06] ring-1 ring-inset ring-stone-900/[0.07] dark:bg-white/[0.07] dark:ring-white/[0.08]',
              )}
            >
              <span
                className={cn(
                  'text-xl font-bold tabular-nums',
                  first
                    ? 'text-brand-700 dark:text-brand-200'
                    : 'text-stone-500 dark:text-stone-400',
                )}
              >
                {place}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
