'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { CaptchaWidget, CAPTCHA_CANCELLED, type CaptchaHandle } from '@/components/auth/CaptchaWidget';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Капча невидимая: обычный пользователь ничего не увидит, задание получат
      // только подозрительные запросы. Без настроенных ключей вернётся пустая строка.
      let captchaToken = '';
      try {
        captchaToken = (await captchaRef.current?.execute()) ?? '';
      } catch (err) {
        if (err instanceof Error && err.message === CAPTCHA_CANCELLED) {
          setError('Проверка «я не бот» не пройдена. Попробуйте ещё раз.');
          return;
        }
        throw err;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, captchaToken }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Ошибка входа');
        return;
      }
      router.push('/rooms');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="card animate-slide-up">
          <h1 className="font-display text-3xl">Войти</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Email или телефон, который вы использовали при регистрации
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email или телефон">
              <input
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="teacher@chess.ru или +79991234567"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Пароль">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <CaptchaWidget ref={captchaRef} invisible />

            {error && (
              <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Входим…' : 'Войти'}
            </button>

            <div className="flex flex-col gap-1 text-center text-sm text-stone-500">
              <Link href="/forgot-password" className="text-brand-600 hover:underline">
                Забыли пароль?
              </Link>
              <p>
                Нет аккаунта?{' '}
                <Link href="/register" className="text-brand-600 hover:underline">
                  Зарегистрироваться
                </Link>
              </p>
            </div>
          </form>
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
