'use client';

// Карточка с живым отсчётом:
//  • scheduled — «до начала турнира» (до startsAt);
//  • running   — «до окончания турнира» (до endsAt);
//  • finished  — «турнир завершён».
// Используется и слева во время партии, и справа — пока ждёшь подбор.

import { useEffect, useState } from 'react';

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} д ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  status: string;
  /** ISO-строка времени старта турнира (для статуса 'scheduled'). */
  startsAt?: string | null;
  /** ISO-строка времени окончания (для статуса 'running'). */
  endsAt: string | null;
  className?: string;
}

export function TournamentCountdown({ status, startsAt, endsAt, className }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());

  // Тикаем раз в секунду, пока турнир запланирован или идёт.
  useEffect(() => {
    if (status !== 'running' && status !== 'scheduled') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  if (status === 'scheduled') {
    const target = startsAt ? new Date(startsAt).getTime() : null;
    const left = target !== null ? Math.max(0, target - now) : null;
    const lowTime = left !== null && left < 60_000;
    return (
      <div className={`card !p-3 ${className ?? ''}`}>
        <div className="text-xs uppercase tracking-wide text-stone-500">До начала турнира</div>
        {left !== null ? (
          <>
            <div
              className={`mt-0.5 text-2xl font-semibold tabular-nums ${
                lowTime ? 'text-amber-600 dark:text-amber-400' : 'text-stone-700 dark:text-stone-200'
              }`}
            >
              {left > 0 ? fmt(left) : 'Скоро начнётся'}
            </div>
            {target !== null && (
              <div className="mt-0.5 text-[11px] text-stone-400">
                Старт: {new Date(target).toLocaleString('ru-RU')}
              </div>
            )}
          </>
        ) : (
          <div className="font-semibold tabular-nums text-stone-700 dark:text-stone-200">—</div>
        )}
      </div>
    );
  }
  if (status === 'finished') {
    return (
      <div className={`card !p-3 text-sm ${className ?? ''}`}>
        <div className="font-semibold text-stone-600 dark:text-stone-300">Турнир завершён</div>
      </div>
    );
  }
  if (status !== 'running' || !endsAt) {
    return null;
  }

  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const lowTime = left < 60_000;

  return (
    <div className={`card !p-3 ${className ?? ''}`}>
      <div className="text-xs uppercase tracking-wide text-stone-500">До окончания турнира</div>
      <div
        className={`mt-0.5 text-2xl font-semibold tabular-nums ${
          lowTime ? 'text-amber-600 dark:text-amber-400' : 'text-stone-700 dark:text-stone-200'
        }`}
      >
        {fmt(left)}
      </div>
    </div>
  );
}
