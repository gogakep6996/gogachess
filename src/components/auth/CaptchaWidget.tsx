'use client';

import { useEffect, useRef } from 'react';

/**
 * Виджет Cloudflare Turnstile. Рендерится только если задан
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY. Без него компонент не показывает ничего,
 * и форма работает как раньше (сервер тоже пропустит проверку, см. lib/captcha.ts).
 *
 * Загрузка скрипта turnstile.js делается лениво и идемпотентно (если другой
 * виджет на странице уже его подгрузил — повторно не качаем).
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface Props {
  onToken: (token: string) => void;
}

interface TurnstileGlobal {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
    },
  ) => string;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

export function CaptchaWidget({ onToken }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;

    const ensureScript = (): Promise<void> => {
      if (window.turnstile) return Promise.resolve();
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        return new Promise((resolve) => existing.addEventListener('load', () => resolve()));
      }
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Turnstile script failed to load'));
        document.head.appendChild(s);
      });
    };

    ensureScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
          theme: 'auto',
        });
      })
      .catch((err) => {
        console.error('[captcha] failed to load Turnstile:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="flex justify-center" />;
}
