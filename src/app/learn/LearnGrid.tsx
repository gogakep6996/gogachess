'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSolvedIds } from '@/lib/training-progress';

interface CategoryCard {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tone: string;
  count: number;
}

export function LearnGrid({ categories }: { categories: CategoryCard[] }) {
  // Прогресс читаем после монтирования, чтобы не ломать SSR-гидрацию.
  const [solved, setSolved] = useState<Record<string, number>>({});

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const c of categories) map[c.id] = getSolvedIds(c.id).length;
    setSolved(map);
  }, [categories]);

  return (
    <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const done = Math.min(solved[c.id] ?? 0, c.count);
        const pct = c.count > 0 ? Math.round((done / c.count) * 100) : 0;
        return (
          <Link key={c.id} href={`/learn/${c.id}`} className="tile group">
            <div className="flex items-start justify-between gap-3">
              <div
                className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl shadow-soft ${c.tone}`}
              >
                {c.icon}
              </div>
              <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                {c.count} задач
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
            <p className="mt-1 min-h-[2.5rem] text-sm text-stone-600 dark:text-stone-400">
              {c.desc}
            </p>
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                <span>Решено: {done}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition-transform group-hover:translate-x-0.5 dark:text-brand-300">
              Решать <span aria-hidden>→</span>
            </div>
          </Link>
        );
      })}
    </section>
  );
}
