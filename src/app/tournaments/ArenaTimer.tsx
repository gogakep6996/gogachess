'use client';

// Живой отсчёт в карточке турнира: до старта или до конца подбора пар.
// Отдельный клиентский островок, чтобы сам список остался серверным.

import { useEffect, useState } from 'react';

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
  // Список турниров рисуется на сервере, а отсчёт зависит от текущего времени:
  // между ответом сервера и оживлением страницы в браузере проходит секунда-две,
  // и цифры уже не совпадают. React считает это ошибкой разметки, поэтому до
  // оживления показываем заглушку — она одинакова и на сервере, и в браузере.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  if (status === 'finished') return <>завершён</>;
  if (!live) return <>…</>;

  if (status === 'scheduled') {
    const left = new Date(startsAt).getTime() - now;
    if (left <= 0) return <>начинается</>;
    return <>осталось {formatLeft(left)}</>;
  }

  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return <>партии доигрываются</>;
  return <>осталось {formatLeft(left)}</>;
}
