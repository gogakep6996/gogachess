'use client';

// Часы партии. Состояние «истина в последней инстанции» — сервер,
// но для плавного UI мы локально вычитаем время каждые 100мс из running-стороны.

import { useEffect, useRef, useState } from 'react';
import type { ClockState } from '@/lib/socket-events';

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  // Если осталось меньше 10 секунд — показываем десятые, как в Личесс.
  if (ms < 10_000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  /** Серверное состояние часов (snapshot на момент lastTickAt). */
  clock: ClockState;
  /** Какую сторону отображаем. */
  side: 'w' | 'b';
  /** Подсветка «это мой таймер». */
  isMine?: boolean;
  className?: string;
}

export function ClockDisplay({ clock, side, isMine, className }: Props) {
  const running = clock.running === side;
  // Чтобы локальный тик не «прыгал» при каждом серверном snapshot'е,
  // фиксируем базу: server'овский остаток + момент, когда мы её получили.
  const baseRef = useRef({
    baseMs: side === 'w' ? clock.whiteMs : clock.blackMs,
    lastTickAt: clock.lastTickAt,
    receivedAt: Date.now(),
    running,
  });

  // Обновляем базу при каждом snapshot от сервера.
  useEffect(() => {
    baseRef.current = {
      baseMs: side === 'w' ? clock.whiteMs : clock.blackMs,
      lastTickAt: clock.lastTickAt,
      receivedAt: Date.now(),
      running: clock.running === side,
    };
  }, [side, clock.whiteMs, clock.blackMs, clock.lastTickAt, clock.running]);

  const [display, setDisplay] = useState<number>(baseRef.current.baseMs);

  useEffect(() => {
    const tick = () => {
      const b = baseRef.current;
      if (!b.running) {
        setDisplay(b.baseMs);
        return;
      }
      // Считаем «сколько уже прошло с момента serverNow=lastTickAt»: эту разницу
      // оцениваем как elapsed = (now - receivedAt) — серверный сдвиг времени игнорируем,
      // т.к. UI обновляется при каждом серверном snapshot'е и набегает максимум ~250мс.
      const elapsed = Date.now() - b.receivedAt;
      setDisplay(Math.max(0, b.baseMs - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [clock.lastTickAt, clock.whiteMs, clock.blackMs, clock.running, side]);

  const low = display < 30_000;
  const critical = display < 10_000;
  return (
    <div
      className={[
        'rounded-xl px-4 py-3 text-3xl font-semibold tabular-nums shadow-sm transition-colors',
        running
          ? critical
            ? 'bg-red-500 text-white'
            : low
              ? 'bg-amber-400 text-stone-900'
              : 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900'
          : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
        isMine ? 'ring-2 ring-brand-400/60' : '',
        className ?? '',
      ].join(' ')}
      aria-live={running ? 'polite' : 'off'}
    >
      {fmt(display)}
    </div>
  );
}
