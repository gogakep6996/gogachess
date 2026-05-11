'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, displayName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Не удалось зарегистрироваться');
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
          <h1 className="font-display text-3xl">Регистрация</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Войдите по email <span className="text-brand-600">или</span> номеру телефона
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Имя (как видят ученики)">
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Иван Петрович"
                required
              />
            </Field>
            <Field label="Email или телефон">
              <input
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="teacher@chess.ru или +79991234567"
                required
              />
            </Field>
            <Field label="Пароль (минимум 6 символов)">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Создаём…' : 'Создать аккаунт'}
            </button>

            <p className="text-center text-sm text-stone-500">
              Уже есть аккаунт?{' '}
              <Link href="/login" className="text-brand-600 hover:underline">
                Войти
              </Link>
            </p>
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
