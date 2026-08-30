'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EnvelopeSimple, PaperPlaneTilt } from '@phosphor-icons/react';
import { SURFACE } from '@/components/class/ui';
import { ToolButton } from '@/components/room/ui';
import { cn } from '@/lib/utils';

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
    <main className="mx-auto flex w-full max-w-xl flex-col px-6 py-12">
      <div className={cn('p-6', SURFACE)}>
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300"
        >
          <EnvelopeSimple size={20} weight="bold" />
        </span>
        <h1 className="mt-3 text-[21px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50">
          Подтвердите почту, чтобы создать класс
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-stone-600 dark:text-stone-400">
          Так мы отсекаем ботов и защищаем ваших будущих учеников.
        </p>
        {email ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
            Ссылка отправлена на <b>{email}</b>. Откройте письмо и нажмите «Подтвердить email».
          </p>
        ) : (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] leading-relaxed text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            У вашего аккаунта нет почты. Добавьте её, чтобы продолжить.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {email && (
            <ToolButton
              icon={PaperPlaneTilt}
              tone="primary"
              size="md"
              onClick={resend}
              disabled={status === 'sending' || status === 'sent'}
            >
              {status === 'sending'
                ? 'Отправляем…'
                : status === 'sent'
                  ? 'Отправлено'
                  : 'Отправить письмо ещё раз'}
            </ToolButton>
          )}
          <Link
            href="/rooms"
            className="text-[13px] font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
          >
            Вернуться в кабинет
          </Link>
        </div>
        {message && (
          <p className="mt-3 text-[12px] text-stone-500 dark:text-stone-400">{message}</p>
        )}
      </div>
    </main>
  );
}
