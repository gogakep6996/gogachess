'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderTile, FolderGraphic } from '@/components/ui/FolderTile';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface LibraryTask {
  id: string;
  title: string;
  fen: string;
  sideToPlay: string;
  category: string | null;
  difficulty: string;
  /** Папки «Моей библиотеки» (организационные, отдельные от ДЗ). */
  libraryFolderIds: string[];
}

interface LibraryFolder {
  id: string;
  name: string;
}

const DIFF_TONE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/**
 * Блок «Библиотека» в редакторе доски (комната/класс). Учитель открывает его,
 * видит свои позиции, разложенные по папкам, и одним кликом подгружает любую на
 * доску (через onPick(fen)). Сначала показываются папки, ниже — позиции без папки.
 * Клик по папке открывает её содержимое.
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
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedFolder(null);
    try {
      const [tasksRes, foldersRes] = await Promise.all([
        fetch('/api/class/me/tasks', { cache: 'no-store' }),
        fetch('/api/class/me/library-folders', { cache: 'no-store' }),
      ]);
      if (!tasksRes.ok) throw new Error('failed');
      const tData = (await tasksRes.json()) as { tasks?: LibraryTask[] };
      setTasks(tData.tasks ?? []);
      if (foldersRes.ok) {
        const fData = (await foldersRes.json()) as { folders?: LibraryFolder[] };
        setFolders(fData.folders ?? []);
      } else {
        setFolders([]);
      }
    } catch {
      setError('Не удалось загрузить библиотеку');
      setTasks([]);
      setFolders([]);
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

  // Папки, в которых есть хотя бы одна позиция (+ счётчик), и позиции без папки.
  const { visibleFolders, folderless, selectedTasks } = useMemo(() => {
    const list = tasks ?? [];
    const counts = new Map<string, number>();
    const none: LibraryTask[] = [];
    for (const t of list) {
      if (t.libraryFolderIds && t.libraryFolderIds.length) {
        for (const fid of t.libraryFolderIds) counts.set(fid, (counts.get(fid) ?? 0) + 1);
      } else {
        none.push(t);
      }
    }
    const vf = folders
      .filter((f) => (counts.get(f.id) ?? 0) > 0)
      .map((f) => ({ ...f, count: counts.get(f.id) ?? 0 }));
    const sel = selectedFolder
      ? list.filter((t) => t.libraryFolderIds?.includes(selectedFolder))
      : [];
    return { visibleFolders: vf, folderless: none, selectedTasks: sel };
  }, [tasks, folders, selectedFolder]);

  const selectedName = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)?.name ?? 'Папка'
    : null;

  // Кнопка выбора позиции (общая для обоих вариантов).
  const pickButton = (t: LibraryTask, size: number) => (
    <button
      type="button"
      onClick={() => onPick(t.fen || STARTING_FEN)}
      className="group flex w-full flex-col items-center gap-0.5 rounded-md border border-stone-200 bg-paper p-1 shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:ring-brand-700"
      title={`Загрузить «${t.title}» на доску`}
    >
      <MiniBoard fen={t.fen || STARTING_FEN} size={size} flipped={t.sideToPlay === 'b'} />
      <span className="w-full truncate text-center text-[11px] font-semibold leading-tight text-stone-700 dark:text-stone-200">
        {t.title}
      </span>
    </button>
  );

  const backButton = (
    <button
      type="button"
      onClick={() => setSelectedFolder(null)}
      className="flex items-center gap-1 rounded-md border border-stone-300/70 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      ‹ Папки
    </button>
  );

  const emptyHint = (
    <div className="py-2 text-center text-[10px] leading-snug text-stone-400">
      Нет опубликованных позиций.
    </div>
  );

  // ─────────────────────────── COMPACT (узкая колонка) ───────────────────────────
  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col rounded-lg border border-stone-200/70 bg-paper/70 p-1.5 shadow-sm transition-[width] dark:border-stone-700/60 dark:bg-stone-900/40',
          // Свёрнута — по ширине колонки (110px). Открыта — расширяется вправо,
          // чтобы позиции были крупнее; не слишком широко, чтобы не залезть на
          // историю/аудио справа.
          open ? 'z-20 min-h-0 w-[176px] flex-1' : 'w-full',
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
          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
            {loading && <div className="py-2 text-center text-[10px] text-stone-400">Загрузка…</div>}
            {!loading && error && <div className="py-2 text-center text-[10px] text-red-500">{error}</div>}
            {!loading && !error && tasks && tasks.length === 0 && emptyHint}

            {!loading && !error && tasks && tasks.length > 0 && selectedFolder && (
              <>
                <div className="flex items-center gap-1">
                  {backButton}
                  <span className="truncate text-[10px] font-semibold text-stone-600 dark:text-stone-300">
                    {selectedName}
                  </span>
                </div>
                {selectedTasks.map((t) => (
                  <div key={t.id}>{pickButton(t, 150)}</div>
                ))}
              </>
            )}

            {!loading && !error && tasks && tasks.length > 0 && !selectedFolder && (
              <>
                {visibleFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFolder(f.id)}
                    className="flex w-full items-center gap-1.5 rounded-md border border-stone-200 bg-paper px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow-md dark:border-stone-700 dark:bg-stone-900"
                    title={`Открыть «${f.name}»`}
                  >
                    <FolderGraphic className="h-6 w-7 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-700 dark:text-stone-200">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-stone-400">{f.count}</span>
                  </button>
                ))}
                {folderless.map((t) => (
                  <div key={t.id}>{pickButton(t, 150)}</div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────── FULL (широкая панель) ───────────────────────────
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
              {selectedFolder
                ? 'Нажмите на позицию — она загрузится на доску.'
                : 'Выберите папку или нажмите на позицию ниже.'}
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

          {loading && <div className="py-3 text-center text-[11px] text-stone-400">Загрузка…</div>}
          {!loading && error && <div className="py-2 text-center text-[11px] text-red-500">{error}</div>}
          {!loading && !error && tasks && tasks.length === 0 && (
            <div className="py-2 text-center text-[11px] text-stone-400">
              Нет опубликованных позиций. Сохраните и опубликуйте задачи в разделе «Мой класс».
            </div>
          )}

          {!loading && !error && tasks && tasks.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto pr-0.5">
              {selectedFolder ? (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {backButton}
                    <span className="truncate text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                      {selectedName} · {selectedTasks.length}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {selectedTasks.map((t) => (
                      <li key={t.id}>{pickButton(t, 80)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  {visibleFolders.length > 0 && (
                    <ul className="mb-2 grid grid-cols-3 gap-1.5">
                      {visibleFolders.map((f) => (
                        <li key={f.id}>
                          <FolderTile
                            name={f.name}
                            count={f.count}
                            graphicClassName="h-10 w-12"
                            onOpen={() => setSelectedFolder(f.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {folderless.length > 0 ? (
                    <ul className="grid grid-cols-2 gap-1.5">
                      {folderless.map((t) => (
                        <li key={t.id}>{pickButton(t, 80)}</li>
                      ))}
                    </ul>
                  ) : (
                    visibleFolders.length > 0 && (
                      <div className="py-1 text-center text-[10px] text-stone-400">
                        Все позиции — в папках выше.
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
