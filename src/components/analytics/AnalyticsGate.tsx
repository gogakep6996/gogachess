'use client';

import { useEffect, useState } from 'react';
import { YandexMetrika } from './YandexMetrika';
import { CONSENT_EVENT, getConsent } from '@/lib/consent';

/**
 * Подключает Яндекс.Метрику ТОЛЬКО после согласия пользователя на аналитические
 * cookie (см. CookieConsent + lib/consent). Пока согласие не дано или отклонено —
 * скрипты не загружаются и cookie не ставятся (152-ФЗ, opt-in).
 *
 * Google Analytics убран: на российском домене его использовать нельзя.
 * Не возвращайте его сюда — вместе со скриптом придётся вернуть и упоминание
 * трансграничной передачи данных в политику.
 *
 * Если захотите «информационный» режим (аналитика грузится сразу, баннер лишь
 * уведомляет) — верните в layout.tsx прямой рендер <YandexMetrika/>.
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
  return <YandexMetrika />;
}
