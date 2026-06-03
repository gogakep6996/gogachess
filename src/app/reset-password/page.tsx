'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

// Suspense обёртка обязательна в Next 15 для useSearchParams() — см. /verify.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Header />}>
      <ResetContent />
    </Suspense>
  );
}

function ResetContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setError('Пароль минимум 8 символов');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Не удалось сбросить пароль');
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push('/rooms');
        router.refresh();
      }, 1800);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <Header />
        <main className="mx-auto flex max-w-md flex-col px-6 py-16">
          <div className="card animate-slide-up text-center">
            <h1 className="font-display text-3xl">Сброс пароля</h1>
            <p className="mt-4 rounded-lg bg-red-100 px-3 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              В ссылке нет токена. Откройте письмо ещё раз или запросите новое.
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 inline-block text-brand-600 hover:underline"
            >
              Запросить ссылку →
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="card animate-slide-up">
          <h1 className="font-display text-3xl">Новый пароль</h1>
          {!done ? (
            <>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Введите новый пароль для вашего аккаунта.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <Field label="Новый пароль (минимум 8 символов)">
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field label="Подтвердите пароль">
                  <input
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </Field>

                {error && (
                  <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Сохраняем…' : 'Установить новый пароль'}
                </button>
              </form>
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              Пароль обновлён. Перенаправляем в кабинет…
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{label}</span>
      {children}
    </label>
  );
}
