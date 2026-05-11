'use client';

import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label="Сменить тему"
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className={cn(
        'relative inline-flex h-9 w-16 items-center rounded-full border transition-colors',
        isDark
          ? 'border-stone-700 bg-stone-800'
          : 'border-stone-300 bg-stone-100',
        className,
      )}
    >
      <span
        className={cn(
          'absolute left-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-300 shadow',
          isDark ? 'translate-x-7 bg-brand-500 text-white' : 'translate-x-0 bg-white text-brand-500',
        )}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}
