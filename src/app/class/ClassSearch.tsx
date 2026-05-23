'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
      <div className="mb-5">
        <input
          type="search"
          placeholder="Найти учителя по имени или адресу класса…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900"
        />
      </div>

      {classes.length === 0 ? (
        <div className="card text-sm text-stone-500">
          {loading ? 'Ищем…' : 'Ничего не найдено. Попробуйте другой запрос.'}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/class/${c.slug}`}
                className="card block transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">
                      {c.name || `Класс — ${c.ownerName}`}
                    </div>
                    <div className="mt-1 truncate text-xs text-stone-500">
                      Учитель: {c.ownerName} · /class/{c.slug}
                    </div>
                  </div>
                  {c.hasAccessCode && (
                    <span
                      title="Закрытый класс — нужен код"
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      код
                    </span>
                  )}
                </div>
                <div className="mt-3 text-xs text-stone-500">
                  {c.tasksCount === 0
                    ? 'Пока без задач'
                    : `${c.tasksCount} ${plural(c.tasksCount, 'задача', 'задачи', 'задач')}`}
                </div>
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
