'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
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

            {error && (
              <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Входим…' : 'Войти'}
            </button>

            <p className="text-center text-sm text-stone-500">
              Нет аккаунта?{' '}
              <Link href="/register" className="text-brand-600 hover:underline">
                Зарегистрироваться
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
