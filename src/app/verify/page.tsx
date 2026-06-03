'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

/**
 * Страница подтверждения email. Сюда ведёт ссылка из письма
 * вида /verify?token=... — на mount мы автоматически шлём токен на
 * сервер. Пользователю не нужно нажимать ничего лишнего.
 *
 * Suspense обёртка обязательна в Next 15: useSearchParams() при сборке
 * требует boundary, иначе `next build` падает с ошибкой о CSR bailout.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Header />}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState<string>('Подтверждаем вашу почту…');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('В ссылке нет токена. Откройте письмо ещё раз.');
      return;
    }
    let cancelled = false;
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Не удалось подтвердить email');
          return;
        }
        setStatus('ok');
        setMessage(
          'Email подтверждён. Теперь вам доступны все функции (создание класса, турниры).',
        );
        // Обновляем серверный state (HEAD-куки), чтобы плашка пропала.
        router.refresh();
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        setMessage('Сбой сети. Попробуйте обновить страницу.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="card animate-slide-up text-center">
          <h1 className="font-display text-3xl">Подтверждение email</h1>
          <p
            className={
              'mt-4 rounded-lg px-3 py-3 text-sm ' +
              (status === 'ok'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                : status === 'error'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300')
            }
          >
            {message}
          </p>
          {status === 'ok' && (
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/rooms" className="btn-primary">
                В кабинет
              </Link>
              <Link href="/class/me" className="text-sm text-brand-600 hover:underline">
                Открыть мой класс →
              </Link>
            </div>
          )}
          {status === 'error' && (
            <div className="mt-6 flex flex-col gap-2 text-sm text-stone-600 dark:text-stone-400">
              <p>
                Если ссылка устарела — войдите в аккаунт и нажмите «Отправить ещё раз»
                в плашке вверху сайта.
              </p>
              <Link href="/login" className="text-brand-600 hover:underline">
                Войти →
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
