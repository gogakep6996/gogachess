'use client';

// Отсчёт до момента времени. Отдельный компонент по важной причине: тикающее
// раз в секунду состояние перерисовывает только эти цифры. Если бы счётчик
// жил в родителе, вместе с ним каждую секунду перерисовывалась бы и доска.

import { formatLeft, useNow } from './time';

export function Countdown({
  to,
  zeroText = '0:00',
  className,
}: {
  /** ISO-время, до которого считаем. */
  to: string;
  /** Что показать, когда время вышло. */
  zeroText?: string;
  className?: string;
}) {
  const now = useNow(1000);
  const left = new Date(to).getTime() - now;
  return <span className={className}>{left <= 0 ? zeroText : formatLeft(left)}</span>;
}
