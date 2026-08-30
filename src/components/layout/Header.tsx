'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useEffect, useState } from 'react';
import { EmailVerifyBanner } from '@/components/auth/EmailVerifyBanner';
import { AccountMenu } from '@/components/layout/AccountMenu';

interface MeUser {
  id: string;
  displayName: string;
  email: string | null;
  phone?: string | null;
  emailVerifiedAt: string | null;
}

interface MeResponse {
  user: MeUser | null;
}

export function Header() {
  const [user, setUser] = useState<MeUser | null>(null);
  const pathname = usePathname();

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

  // Плашка «Подтвердите email» показывается под основным хедером,
  // если пользователь залогинен, у него есть email и он ещё не подтверждён.
  // На страницах с доской (комната, личный кабинет класса, публичная страница
  // класса) её прячем — там каждый пиксель высоты на счету, иначе доска
  // сжимается и съезжает раскладка.
  const hideBannerOnBoardPage = Boolean(
    pathname &&
      (pathname.startsWith('/room/') ||
        pathname === '/class/me' ||
        pathname.startsWith('/class/me/') ||
        // /class/<slug> — публичная страница класса, кроме /class и /classes
        /^\/class\/[^/]+$/.test(pathname)),
  );
  const showVerifyBanner = Boolean(
    // На локалке (dev) баннер не показываем — подтверждение email там не требуется.
    process.env.NODE_ENV === 'production' &&
      user &&
      user.email &&
      !user.emailVerifiedAt &&
      !hideBannerOnBoardPage,
  );

  return (
    <header className="sticky top-0 z-30 border-b border-stone-900/[.06] bg-surface-light/80 backdrop-blur-md dark:border-white/[.06] dark:bg-surface-dark/80">
      <div className="flex w-full items-center justify-between px-2 py-1.5 sm:px-3 lg:pl-4 lg:pr-5">
        <Link href="/" className="flex items-center gap-2.5 font-display">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white shadow-soft">
            <svg
              viewBox="0 0 45 45"
              className="h-[20px] w-[20px] text-white"
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="currentColor"
                d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
              />
            </svg>
          </span>
          <span className="text-xl font-semibold leading-none tracking-tight sm:text-[1.4rem]">gogachess</span>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          <NavLink href="/rooms" pathname={pathname}>Быстрый урок</NavLink>
          <NavLink href="/class" pathname={pathname}>Групповой урок</NavLink>
          <span className="mx-1 hidden h-5 w-px bg-stone-900/10 sm:block dark:bg-white/10" aria-hidden />
          <ThemeToggle />
          {user ? (
            <AccountMenu user={user} onUserChange={setUser} onLogout={logout} />
          ) : (
            <Link href="/login" className="btn-primary px-4 py-2 text-sm">
              Войти
            </Link>
          )}
        </nav>
      </div>
      {showVerifyBanner && user?.email && <EmailVerifyBanner email={user.email} />}
    </header>
  );
}

/** Ссылка основной навигации с подсветкой активного раздела. */
function NavLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string | null;
  children: React.ReactNode;
}) {
  const active = pathname === href || (pathname?.startsWith(href + '/') ?? false);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`hidden rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors sm:inline ${
        active
          ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
          : 'text-stone-600 hover:bg-stone-900/[.05] hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[.06] dark:hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
