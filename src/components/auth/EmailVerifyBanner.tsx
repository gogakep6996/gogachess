'use client';

import { useState } from 'react';

/**
 * Плашка под Header'ом: «Подтвердите email».
 * Виден только залогиненным пользователям с непустым email и emailVerifiedAt == null.
 * Один клик «Отправить ещё раз» дёргает /api/auth/resend-verification
 * (на сервере rate-limit 60 сек на пользователя).
 */
export function EmailVerifyBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function resend() {
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = (await res.json()) as { error?: string; alreadyVerified?: boolean };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Не удалось отправить письмо');
        return;
      }
      if (data.alreadyVerified) {
        setStatus('sent');
        setMessage('Email уже подтверждён. Обновите страницу.');
        return;
      }
      setStatus('sent');
      setMessage('Письмо отправлено. Проверьте папку «Спам».');
    } catch {
      setStatus('error');
      setMessage('Сбой сети. Попробуйте позже.');
    }
  }

  return (
    <div className="border-t border-amber-300/60 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span>
          📧 Подтвердите email <b>{email}</b> — без подтверждения нельзя создать класс и
          запустить турнир.
        </span>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs opacity-80">{message}</span>}
          <button
            type="button"
            onClick={resend}
            disabled={status === 'sending' || status === 'sent'}
            className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
          >
            {status === 'sending'
              ? 'Отправляем…'
              : status === 'sent'
                ? 'Отправлено'
                : 'Отправить ещё раз'}
          </button>
        </div>
      </div>
    </div>
  );
}
