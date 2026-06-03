'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить письмо');
        return;
      }
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="card animate-slide-up">
          <h1 className="font-display text-3xl">Сброс пароля</h1>
          {!submitted ? (
            <>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Введите email, на который зарегистрирован аккаунт. Мы отправим
                ссылку для сброса пароля.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                    Email
                  </span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                {error && (
                  <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Отправляем…' : 'Отправить ссылку'}
                </button>

                <p className="text-center text-sm text-stone-500">
                  Вспомнили пароль?{' '}
                  <Link href="/login" className="text-brand-600 hover:underline">
                    Войти
                  </Link>
                </p>
              </form>
            </>
          ) : (
            <div className="mt-2 space-y-4 text-sm text-stone-700 dark:text-stone-300">
              <p className="rounded-lg bg-emerald-100 px-3 py-3 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                Если этот email зарегистрирован — мы отправили на него письмо со ссылкой
                для сброса пароля. Ссылка действует 1 час.
              </p>
              <p className="text-stone-500">
                Не получили письмо? Проверьте папку «Спам». Если совсем ничего — попробуйте
                запросить ещё раз через несколько минут.
              </p>
              <Link href="/login" className="text-brand-600 hover:underline">
                ← Назад ко входу
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
