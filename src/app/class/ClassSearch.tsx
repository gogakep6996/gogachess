'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CaretRight, Lock, MagnifyingGlass } from '@phosphor-icons/react';
import { EmptyState, SURFACE } from '@/components/class/ui';
import { StatusChip } from '@/components/room/ui';
import { cn } from '@/lib/utils';

interface ClassDto {
  slug: string;
  name: string | null;
  ownerName: string;
  tasksCount: number;
  hasAccessCode: boolean;
}

export function ClassSearch({ initialClasses }: { initialClasses: ClassDto[] }) {
  const [q, setQ] = useState('');
  const [classes, setClasses] = useState<ClassDto[]>(initialClasses);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/class?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { classes: ClassDto[] };
          setClasses(data.classes);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  return (
    <>
      <label className="relative mb-4 block">
        <MagnifyingGlass
          size={16}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <input
          type="search"
          placeholder="Найти учителя по имени или адресу класса"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Поиск класса"
          className="h-11 w-full rounded-2xl border-0 bg-white/90 pl-10 pr-4 text-[14px] text-stone-800 shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] outline-none ring-1 ring-inset ring-stone-900/[0.07] transition placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500/50 dark:bg-stone-900/70 dark:text-stone-100 dark:ring-white/[0.08]"
        />
      </label>

      {classes.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title={loading ? 'Ищем…' : 'Ничего не нашлось'}
          hint={loading ? undefined : 'Попробуйте другое имя учителя или адрес класса.'}
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/class/${c.slug}`}
                className={cn(
                  'group flex items-center gap-3 p-3 transition-all duration-150',
                  'hover:-translate-y-0.5 hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
                  'dark:hover:bg-brand-950/40',
                  SURFACE,
                )}
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-[15px] font-bold text-brand-700 transition-colors duration-150 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-400/15 dark:text-brand-300"
                >
                  {(c.name || c.ownerName).slice(0, 1).toUpperCase()}
                </span>

                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-stone-800 dark:text-stone-100">
                      {c.name || `Класс — ${c.ownerName}`}
                    </span>
                    {c.hasAccessCode && (
                      <StatusChip tone="amber">
                        <Lock size={10} weight="bold" aria-hidden />
                        код
                      </StatusChip>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-stone-500 dark:text-stone-400">
                    {c.ownerName} ·{' '}
                    {c.tasksCount === 0
                      ? 'пока без задач'
                      : `${c.tasksCount} ${plural(c.tasksCount, 'задача', 'задачи', 'задач')}`}
                  </span>
                </span>

                <CaretRight
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-stone-600"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
