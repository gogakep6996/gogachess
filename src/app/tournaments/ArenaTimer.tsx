'use client';

// Живой отсчёт в карточке турнира: до старта или до конца подбора пар.
// Отдельный клиентский островок, чтобы сам список остался серверным.

import { formatLeft, useNow } from '@/components/arena/time';

export function ArenaTimer({
  status,
  startsAt,
  endsAt,
}: {
  status: string;
  startsAt: string;
  endsAt: string;
}) {
  const now = useNow(1000);

  if (status === 'finished') return <>завершён</>;

  if (status === 'scheduled') {
    const left = new Date(startsAt).getTime() - now;
    if (left <= 0) return <>начинается</>;
    return <>осталось {formatLeft(left)}</>;
  }

  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return <>партии доигрываются</>;
  return <>осталось {formatLeft(left)}</>;
}
