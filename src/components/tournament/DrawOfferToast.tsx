'use client';

// Баннер «соперник предложил ничью». Появляется только у получателя оффера,
// показывает обратный отсчёт до автоотклонения.

import { useEffect, useState } from 'react';
import type { DrawOfferState } from '@/lib/socket-events';

interface Props {
  offer: DrawOfferState;
  myUserId: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function DrawOfferToast({ offer, myUserId, onAccept, onDecline }: Props) {
  const isIncoming = offer.fromUserId !== myUserId;
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.ceil((offer.expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((offer.expiresAt - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [offer.expiresAt]);

  if (isIncoming) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm shadow-sm dark:border-amber-500/40 dark:bg-amber-900/30">
        <span>
          Соперник предлагает ничью{' '}
          <span className="text-xs text-stone-500">({secondsLeft} с)</span>
        </span>
        <span className="flex gap-2">
          <button onClick={onAccept} className="btn-primary px-3 py-1 text-xs">
            Принять
          </button>
          <button onClick={onDecline} className="btn-outline px-3 py-1 text-xs">
            Отклонить
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-stone-300/60 bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-300">
      Предложение ничьей отправлено{' '}
      <span className="text-xs text-stone-500">(ждём ответа {secondsLeft} с)</span>
    </div>
  );
}
