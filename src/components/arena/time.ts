'use client';

// Обратный отсчёт для арены: до старта, до конца, до дедлайна первого хода.

import { useEffect, useState } from 'react';

/** Текущее время с обновлением по таймеру. Один интервал на компонент. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** «7:05» или «1:20:34», если больше часа. Ноль и отрицательное — «0:00». */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`;
}

/** Человеческая длительность: «45 минут», «1 час 30 минут». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} минут`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? '1 час' : `${h} часа`;
  return m === 0 ? hours : `${hours} ${m} минут`;
}
