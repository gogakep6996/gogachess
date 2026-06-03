'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Заглушка для /class/me, когда у пользователя ещё нет класса и email
 * не подтверждён. Это страница «вы почти там — подтвердите почту».
 * Учителя с уже существующим классом сюда не попадают.
 */
export function ClassMeLockedView({ email }: { email: string | null }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function resend() {
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Не удалось отправить письмо');
        return;
      }
      setStatus('sent');
      setMessage('Письмо отправлено. Проверьте «Входящие» и папку «Спам».');
    } catch {
      setStatus('error');
      setMessage('Сбой сети. Попробуйте позже.');
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-12">
      <div className="card">
        <h1 className="font-display text-2xl">Подтвердите email, чтобы создать класс</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Чтобы исключить ботов и защитить ваших учеников, создание класса доступно
          только после подтверждения почты.
        </p>
        {email ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Мы отправили ссылку на <b>{email}</b>. Откройте письмо и нажмите кнопку
            «Подтвердить email».
          </p>
        ) : (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            У вашего аккаунта не указан email. Добавьте его, чтобы продолжить.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {email && (
            <button
              type="button"
              onClick={resend}
              disabled={status === 'sending' || status === 'sent'}
              className="btn-primary text-sm"
            >
              {status === 'sending'
                ? 'Отправляем…'
                : status === 'sent'
                  ? 'Отправлено'
                  : 'Отправить письмо ещё раз'}
            </button>
          )}
          <Link href="/rooms" className="text-sm text-brand-600 hover:underline">
            ← Вернуться в кабинет
          </Link>
        </div>
        {message && (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{message}</p>
        )}
      </div>
    </main>
  );
}
