'use client';

// Турнирная таблица. Внутри партии (compact=true) — без значка #N, только число.
// Снаружи — также без решётки (по пожеланию пользователя);
// решётка остаётся только в шапках игроков над/под доской.

import type { TournamentStandingDto } from '@/lib/socket-events';

interface Props {
  standings: TournamentStandingDto[];
  meId: string | null;
  className?: string;
}

export function StandingsTable({ standings, meId, className }: Props) {
  return (
    <div className={`card !p-3 ${className ?? ''}`}>
      <h3 className="mb-2 text-sm font-semibold">Турнирная таблица</h3>
      {standings.length === 0 ? (
        <p className="text-xs text-stone-500">Пока нет участников.</p>
      ) : (
        <ol className="text-sm">
          {standings.map((p) => (
            <li
              key={p.userId}
              className={`flex items-center justify-between gap-2 border-b border-stone-200/60 py-1.5 last:border-0 dark:border-stone-800/60 ${
                meId === p.userId ? 'font-semibold text-brand-700 dark:text-brand-300' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 text-right text-xs tabular-nums text-stone-500">
                  {p.rank}
                </span>
                <span className="truncate">{p.name}</span>
                {p.isAvailable ? (
                  <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    свободен
                  </span>
                ) : (
                  <span className="badge bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    играет
                  </span>
                )}
              </span>
              <span className="tabular-nums text-xs text-stone-600 dark:text-stone-300">
                {p.score.toFixed(1).replace('.0', '')} / {p.played}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
