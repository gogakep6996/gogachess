'use client';

// Карточка «турнир заканчивается через mm:ss» с живым отсчётом каждую секунду.
// Используется и слева во время партии, и справа — пока ждёшь подбор.

import { useEffect, useState } from 'react';

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  status: string;
  /** ISO-строка времени окончания (если статус !== 'running' — игнорируется). */
  endsAt: string | null;
  className?: string;
}

export function TournamentCountdown({ status, endsAt, className }: Props) {
  const target = endsAt ? new Date(endsAt).getTime() : 0;
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (status !== 'running' || !endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status, endsAt]);

  if (status === 'scheduled') {
    return (
      <div className={`card !p-3 text-sm ${className ?? ''}`}>
        <div className="text-xs uppercase tracking-wide text-stone-500">Старт</div>
        <div className="font-semibold tabular-nums">
          {endsAt ? new Date(endsAt).toLocaleString('ru-RU') : '—'}
        </div>
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

  const left = Math.max(0, target - now);
  const lowTime = left < 60_000;

  return (
    <div className={`card !p-3 ${className ?? ''}`}>
      <div className="text-xs uppercase tracking-wide text-stone-500">
        До окончания турнира
      </div>
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
