'use client';

/**
 * Хранение согласия пользователя на cookie/аналитику (152-ФЗ).
 *  • 'accepted'  — разрешил аналитические cookie (Яндекс.Метрика);
 *  • 'declined'  — только необходимые cookie, аналитика НЕ загружается;
 *  • null        — выбор ещё не сделан (показываем баннер).
 *
 * Версия нужна, чтобы при изменении состава cookie/политики заново спросить согласие.
 */
export const CONSENT_KEY = 'gogachess-cookie-consent';
export const CONSENT_VERSION = 1;
/** Событие окна — баннер и загрузчик аналитики реагируют на смену согласия. */
export const CONSENT_EVENT = 'gogachess-consent-change';

export type ConsentChoice = 'accepted' | 'declined' | null;

export function getConsent(): ConsentChoice {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { v?: number; choice?: string };
    if (data?.v !== CONSENT_VERSION) return null;
    if (data.choice === 'accepted') return 'accepted';
    if (data.choice === 'declined') return 'declined';
    return null;
  } catch {
    return null;
  }
}

export function setConsent(choice: 'accepted' | 'declined'): void {
  try {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: CONSENT_VERSION, choice, ts: Date.now() }),
    );
  } catch {
    // приватный режим — согласие не сохранится, баннер появится снова
  }

  // Дублируем выбор на сервер: localStorage лежит на устройстве пользователя и
  // доказательством его решения быть не может. Для анонимных посетителей запрос
  // ничего не сохранит и просто вернёт saved: false — это нормально.
  // Ошибку глушим: работа баннера не должна зависеть от доступности сети.
  void fetch('/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice }),
    keepalive: true,
  }).catch(() => {});

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }
}
