'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, CaretDown, CaretLeft, CaretUp } from '@phosphor-icons/react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderTile, FolderGraphic } from '@/components/ui/FolderTile';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import { IconButton } from './ui';

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
    let sel: LibraryTask[] = [];
    if (selectedFolder) {
      const sfid = selectedFolder;
      sel = list.filter((t) => t.libraryFolderIds?.includes(sfid));
    }
    return { visibleFolders: vf, folderless: none, selectedTasks: sel };
  }, [tasks, folders, selectedFolder]);

  const selectedName = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)?.name ?? 'Папка'
    : null;

  // Карточка позиции: мини-доска + название. Клик грузит FEN на большую доску.
  const pickButton = (t: LibraryTask, size: number) => (
    <button
      type="button"
      onClick={() => onPick(t.fen || STARTING_FEN)}
      className="group flex w-full flex-col items-center gap-1 rounded-xl bg-stone-900/[0.04] p-1.5 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-white/[0.05] dark:hover:bg-brand-900/30"
      title={`Загрузить «${t.title}» на доску`}
    >
      <span className="overflow-hidden rounded-lg ring-1 ring-stone-900/10 dark:ring-white/10">
        <MiniBoard fen={t.fen || STARTING_FEN} size={size} flipped={t.sideToPlay === 'b'} />
      </span>
      <span className="w-full truncate text-center text-[11px] font-semibold leading-tight text-stone-700 dark:text-stone-200">
        {t.title}
      </span>
    </button>
  );

  const backButton = (
    <button
      type="button"
      onClick={() => setSelectedFolder(null)}
      className="inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:bg-stone-900/[0.06] dark:text-stone-300 dark:hover:bg-white/[0.08]"
    >
      <CaretLeft size={12} weight="bold" aria-hidden />
      Папки
    </button>
  );

  const emptyHint = (
    <p className="py-2 text-center text-[11px] leading-snug text-stone-400">
      Нет опубликованных позиций.
    </p>
  );

  // ─────────────────────────── COMPACT (узкая колонка) ───────────────────────────
  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col rounded-xl bg-stone-900/[0.04] p-1.5 transition-[width] dark:bg-white/[0.05]',
          open ? 'z-20 min-h-0 w-[176px] flex-1' : 'w-full',
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-semibold text-stone-700 dark:text-stone-200"
            title={open ? 'Скрыть библиотеку' : 'Показать библиотеку'}
          >
            {open ? (
              <CaretUp size={11} weight="bold" aria-hidden className="text-stone-400" />
            ) : (
              <CaretDown size={11} weight="bold" aria-hidden className="text-stone-400" />
            )}
            <span className="truncate">Библиотека</span>
          </button>
          {open && (
            <IconButton
              icon={ArrowClockwise}
              label="Обновить список"
              className="!h-6 !w-6"
              disabled={loading}
              onClick={load}
            />
          )}
        </div>

        {open && (
          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
            {loading && <p className="py-2 text-center text-[11px] text-stone-400">Загрузка…</p>}
            {!loading && error && (
              <p className="py-2 text-center text-[11px] text-red-600">{error}</p>
            )}
            {!loading && !error && tasks && tasks.length === 0 && emptyHint}

            {!loading && !error && tasks && tasks.length > 0 && selectedFolder && (
              <>
                <div className="flex items-center gap-1">
                  {backButton}
                  <span className="truncate text-[11px] font-semibold text-stone-600 dark:text-stone-300">
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
                    className="flex w-full items-center gap-1.5 rounded-lg bg-white px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow-md dark:bg-stone-800"
                    title={`Открыть «${f.name}»`}
                  >
                    <FolderGraphic className="h-6 w-7 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-700 dark:text-stone-200">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-stone-400">
                      {f.count}
                    </span>
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

  // ─────────────────── ОСНОВНОЙ ВИД (внутри панели инструментов) ───────────────────
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-xl bg-stone-900/[0.05] px-2.5 text-left text-[12px] font-semibold text-stone-700 transition-colors duration-150 hover:bg-stone-900/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-white/[0.07] dark:text-stone-100 dark:hover:bg-white/[0.12]"
        title="Загрузить сохранённую позицию из вашей библиотеки"
      >
        <span>Библиотека позиций</span>
        {open ? (
          <CaretUp size={13} weight="bold" aria-hidden className="text-stone-400" />
        ) : (
          <CaretDown size={13} weight="bold" aria-hidden className="text-stone-400" />
        )}
      </button>

      {open && (
        <div className="mt-1.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              {selectedFolder
                ? 'Нажмите на позицию, она встанет на доску.'
                : 'Выберите папку или позицию.'}
            </p>
            <IconButton
              icon={ArrowClockwise}
              label="Обновить список"
              className="!h-7 !w-7"
              disabled={loading}
              onClick={load}
            />
          </div>

          {loading && <p className="py-3 text-center text-[12px] text-stone-400">Загрузка…</p>}
          {!loading && error && (
            <p className="py-2 text-center text-[12px] text-red-600">{error}</p>
          )}
          {!loading && !error && tasks && tasks.length === 0 && (
            <p className="py-2 text-center text-[11px] leading-snug text-stone-400">
              Нет опубликованных позиций. Сохраните и опубликуйте задачи в разделе «Мой класс».
            </p>
          )}

          {!loading && !error && tasks && tasks.length > 0 && (
            <div className="max-h-[280px] overflow-y-auto overscroll-contain pr-0.5">
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
                      <p className="py-1 text-center text-[11px] text-stone-400">
                        Все позиции разложены по папкам.
                      </p>
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
