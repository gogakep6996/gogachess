'use client';

import { useCallback, useEffect, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface LibraryTask {
  id: string;
  title: string;
  fen: string;
  sideToPlay: string;
  category: string | null;
  difficulty: string;
}

const DIFF_TONE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/**
 * Блок «Библиотека» в редакторе доски (комната/класс). Учитель открывает его,
 * видит свои опубликованные позиции и одним кликом подгружает любую на доску
 * (через onPick(fen) — это применяется как редактирование позиции).
 */
export function LibraryPanel({
  onPick,
  compact = false,
}: {
  onPick: (fen: string) => void;
  /** Узкая колонка рядом с доской: список в один столбец, всегда раскрыт. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<LibraryTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/class/me/tasks', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { tasks?: LibraryTask[] };
      setTasks(data.tasks ?? []);
    } catch {
      setError('Не удалось загрузить библиотеку');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Подгружаем список при первом раскрытии (в compact — сразу при монтировании).
  useEffect(() => {
    if (open && tasks === null && !loading) {
      load();
    }
  }, [open, tasks, loading, load]);

  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col rounded-lg border border-stone-200/70 bg-paper/70 p-1.5 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/40',
          open && 'min-h-0 flex-1',
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-semibold text-stone-700 dark:text-stone-200"
            title={open ? 'Скрыть библиотеку' : 'Показать библиотеку'}
          >
            <span className="text-[9px] text-stone-400">{open ? '▲' : '▼'}</span>
            <span className="truncate">📚 Библиотека</span>
          </button>
          {open && (
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="shrink-0 rounded border border-stone-300/70 px-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              title="Обновить список"
            >
              ⟳
            </button>
          )}
        </div>

        {open && (
          <div className="mt-1 flex min-h-0 flex-1 flex-col">
            {loading && <div className="py-2 text-center text-[10px] text-stone-400">Загрузка…</div>}
            {!loading && error && <div className="py-2 text-center text-[10px] text-red-500">{error}</div>}
            {!loading && !error && tasks && tasks.length === 0 && (
              <div className="py-2 text-center text-[10px] leading-snug text-stone-400">
                Нет опубликованных позиций.
              </div>
            )}
            {!loading && !error && tasks && tasks.length > 0 && (
              <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onPick(t.fen || STARTING_FEN)}
                      className="group flex w-full flex-col items-center gap-0.5 rounded-md border border-stone-200 bg-paper p-1 shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:ring-brand-700"
                      title={`Загрузить «${t.title}» на доску`}
                    >
                      <MiniBoard fen={t.fen || STARTING_FEN} size={84} flipped={t.sideToPlay === 'b'} />
                      <span className="w-full truncate text-center text-[9px] font-semibold leading-tight text-stone-700 dark:text-stone-200">
                        {t.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-stone-200/80 bg-paper/90 p-2.5 shadow-sm dark:border-stone-700/70 dark:bg-stone-900/65">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1.5 text-left"
        title="Загрузить сохранённую позицию из вашей библиотеки"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200">
          📚 Библиотека позиций
        </span>
        <span className="text-[11px] text-stone-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] leading-snug text-stone-500 dark:text-stone-400">
              Нажмите на позицию — она загрузится на доску.
            </p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="shrink-0 rounded-md border border-stone-300/70 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              title="Обновить список"
            >
              ⟳
            </button>
          </div>

          {loading && (
            <div className="py-3 text-center text-[11px] text-stone-400">Загрузка…</div>
          )}

          {!loading && error && (
            <div className="py-2 text-center text-[11px] text-red-500">{error}</div>
          )}

          {!loading && !error && tasks && tasks.length === 0 && (
            <div className="py-2 text-center text-[11px] text-stone-400">
              Нет опубликованных позиций. Сохраните и опубликуйте задачи в разделе «Мой класс».
            </div>
          )}

          {!loading && !error && tasks && tasks.length > 0 && (
            <ul className="grid max-h-[280px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t.fen || STARTING_FEN)}
                    className="group flex w-full flex-col items-center gap-1 rounded-lg border border-stone-200 bg-paper p-1 text-left shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:ring-brand-700"
                    title={`Загрузить «${t.title}» на доску`}
                  >
                    <MiniBoard fen={t.fen || STARTING_FEN} size={80} flipped={t.sideToPlay === 'b'} />
                    <span className="w-full truncate text-[10px] font-semibold leading-tight text-stone-700 dark:text-stone-200">
                      {t.title}
                    </span>
                    <span className="flex w-full flex-wrap items-center gap-1 text-[8px] uppercase">
                      <span className={`rounded px-1 py-0.5 font-semibold ${DIFF_TONE[t.difficulty] ?? DIFF_TONE.medium}`}>
                        {t.difficulty}
                      </span>
                      {t.category && (
                        <span className="truncate rounded bg-brand-100 px-1 py-0.5 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          {t.category}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
