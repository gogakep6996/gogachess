'use client';

import { useEffect, useState } from 'react';
import { YandexMetrika } from './YandexMetrika';
import { GoogleAnalytics } from './GoogleAnalytics';
import { CONSENT_EVENT, getConsent } from '@/lib/consent';

/**
 * Подключает Яндекс.Метрику и Google Analytics ТОЛЬКО после согласия пользователя
 * на аналитические cookie (см. CookieConsent + lib/consent). Пока согласие не дано
 * или отклонено — скрипты не загружаются и cookie не ставятся (152-ФЗ, opt-in).
 *
 * Если захотите «информационный» режим (аналитика грузится сразу, баннер лишь
 * уведомляет) — верните в layout.tsx прямой рендер <YandexMetrika/> + <GoogleAnalytics/>.
 */
export function AnalyticsGate() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const update = () => setAccepted(getConsent() === 'accepted');
    update();
    window.addEventListener(CONSENT_EVENT, update);
    return () => window.removeEventListener(CONSENT_EVENT, update);
  }, []);

  if (!accepted) return null;
  return (
    <>
      <YandexMetrika />
      <GoogleAnalytics />
    </>
  );
}
