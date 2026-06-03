'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { CaptchaWidget } from '@/components/auth/CaptchaWidget';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, captchaToken }),
      });
      const data = (await res.json()) as { error?: string; user?: { email: string | null } };
      if (!res.ok) {
        setError(data.error || 'Не удалось зарегистрироваться');
        return;
      }
      // Показываем «письмо отправлено», даём пару секунд прочитать, потом ведём в кабинет.
      setSuccess(
        `Мы отправили письмо на ${data.user?.email || email}. ` +
          'Откройте его и нажмите «Подтвердить email», чтобы получить доступ ко всем функциям.',
      );
      setTimeout(() => {
        router.push('/rooms');
        router.refresh();
      }, 2500);
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
            Создаём аккаунт по email. На него придёт письмо с подтверждением.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Имя (как видят ученики)">
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Иван Петрович"
                required
                minLength={2}
                maxLength={64}
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Пароль (минимум 8 символов)">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>

            <CaptchaWidget onToken={setCaptchaToken} />

            {error && (
              <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="btn-primary w-full"
            >
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
