'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CONSENT_EVENT, getConsent, setConsent } from '@/lib/consent';

/**
 * Нижний баннер согласия на cookie. Показывается, пока выбор не сделан.
 *  • «Принять» — разрешает аналитические cookie (включает Метрику через AnalyticsGate);
 *  • «Только необходимые» — отклоняет аналитику, сайт работает на технических cookie.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(getConsent() === null);
    update();
    window.addEventListener(CONSENT_EVENT, update);
    return () => window.removeEventListener(CONSENT_EVENT, update);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-stone-300/80 bg-paper/95 p-4 shadow-xl backdrop-blur-md dark:border-stone-700/80 dark:bg-stone-900/95 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm leading-snug text-stone-700 dark:text-stone-300">
          Мы используем cookie и Яндекс.Метрику, чтобы сайт работал и становился
          удобнее. Подробнее — в{' '}
          <Link href="/privacy" className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">
            Политике обработки персональных данных
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setConsent('declined')}
            className="btn-ghost whitespace-nowrap text-xs"
          >
            Только необходимые
          </button>
          <button
            type="button"
            onClick={() => setConsent('accepted')}
            className="btn-primary whitespace-nowrap text-xs"
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}
