'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useEffect, useState } from 'react';

interface MeResponse {
  user: { id: string; displayName: string } | null;
}

export function Header() {
  const [user, setUser] = useState<MeResponse['user']>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json() as Promise<MeResponse>)
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-surface/70 backdrop-blur-md dark:border-stone-800/60 dark:bg-surface-dark/70">
      <div className="flex w-full items-center justify-between px-2 py-3 sm:px-3 lg:pl-4 lg:pr-5">
        <Link href="/" className="flex items-center gap-3 font-display">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-soft">
            <svg
              viewBox="0 0 45 45"
              className="h-[26px] w-[26px] text-white"
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="currentColor"
                d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
              />
            </svg>
          </span>
          <span className="text-2xl font-semibold leading-none tracking-tight sm:text-[1.65rem]">gogachess</span>
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/rooms" className="hidden text-sm text-stone-600 hover:text-brand-600 dark:text-stone-300 sm:inline">
            Комнаты
          </Link>
          <Link href="/analysis" className="hidden text-sm text-stone-600 hover:text-brand-600 dark:text-stone-300 sm:inline">
            Анализ с движком
          </Link>
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-stone-600 dark:text-stone-300 sm:inline">
                {user.displayName}
              </span>
              <button onClick={logout} className="btn-ghost text-xs">
                Выйти
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-xs">
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
