'use client';

import { useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderIcon } from '@/components/ui/FolderIcon';
import { STARTING_FEN } from '@/lib/socket-events';
import type { FolderDto, TaskDto } from './TasksLibrary';
import { HomeworkReport } from './HomeworkReport';

const DIFFICULTY_LABEL: Record<string, { label: string; tone: string }> = {
  easy: { label: 'легко', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  medium: { label: 'средне', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  hard: { label: 'сложно', tone: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

// Ключ открытой папки: строка = id папки, null = «Без папки», undefined = корень (список папок).
type OpenKey = string | null | undefined;

export function HomeworkManager({
  tasks,
  folders,
  onTasksChange,
  onFoldersChange,
}: {
  tasks: TaskDto[];
  folders: FolderDto[];
  onTasksChange: (next: TaskDto[]) => void;
  onFoldersChange: (next: FolderDto[]) => void;
}) {
  const [open, setOpen] = useState<OpenKey>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [reportTask, setReportTask] = useState<TaskDto | null>(null);
  const [adding, setAdding] = useState(false);

  const homework = useMemo(() => tasks.filter((t) => t.isHomework), [tasks]);

  const countByFolder = useMemo(() => {
    const map = new Map<string, number>();
    let none = 0;
    for (const t of homework) {
      if (t.folderId) map.set(t.folderId, (map.get(t.folderId) ?? 0) + 1);
      else none += 1;
    }
    return { map, none };
  }, [homework]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/class/me/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { folder } = (await res.json()) as { folder: FolderDto };
        onFoldersChange([...folders, folder]);
        setNewFolderName('');
      }
    } finally {
      setCreating(false);
    }
  }

  async function renameFolder(f: FolderDto) {
    const name = prompt('Новое название папки:', f.name)?.trim();
    if (!name || name === f.name) return;
    onFoldersChange(folders.map((x) => (x.id === f.id ? { ...x, name } : x)));
    const res = await fetch(`/api/class/me/folders/${f.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) onFoldersChange(folders);
  }

  async function deleteFolder(f: FolderDto) {
    if (!confirm(`Удалить папку «${f.name}»? Задания из неё не удалятся — станут «Без папки».`)) return;
    const res = await fetch(`/api/class/me/folders/${f.id}`, { method: 'DELETE' });
    if (res.ok) {
      onFoldersChange(folders.filter((x) => x.id !== f.id));
      onTasksChange(tasks.map((t) => (t.folderId === f.id ? { ...t, folderId: null } : t)));
      if (open === f.id) setOpen(undefined);
    }
  }

  async function patchTask(t: TaskDto, body: Partial<Pick<TaskDto, 'folderId' | 'isHomework'>>) {
    onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, ...body } : x)));
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) onTasksChange(tasks);
  }

  // ── Корень: список папок-блоков ──
  if (open === undefined) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Домашние задания</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Разложите домашки по папкам. Откройте папку, чтобы добавить задания и посмотреть,
              кто и как их решал.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createFolder();
            }}
            className="flex items-center gap-1"
          >
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Новая папка"
              maxLength={60}
              className="w-36 rounded-full border border-stone-300 bg-paper px-3.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || creating}
              className="btn-primary rounded-full px-3.5 py-1.5 text-sm disabled:opacity-50"
            >
              + Папка
            </button>
          </form>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <li key={f.id}>
              <FolderBlock
                title={f.name}
                count={countByFolder.map.get(f.id) ?? 0}
                onOpen={() => setOpen(f.id)}
                onRename={() => renameFolder(f)}
                onDelete={() => deleteFolder(f)}
              />
            </li>
          ))}
          <li>
            <FolderBlock
              title="Без папки"
              count={countByFolder.none}
              muted
              onOpen={() => setOpen(null)}
            />
          </li>
        </ul>

        {folders.length === 0 && countByFolder.none === 0 && (
          <div className="mt-3 text-sm text-stone-500">
            Создайте папку и откройте её, чтобы добавить домашние задания.
          </div>
        )}
      </div>
    );
  }

  // ── Внутри папки ──
  const folder = open === null ? null : folders.find((f) => f.id === open) ?? null;
  const folderName = folder ? folder.name : 'Без папки';
  const inFolder = homework.filter((t) => (t.folderId ?? null) === (open ?? null));
  // Кандидаты на добавление — всё, что ещё не в этой папке как ДЗ.
  const candidates = tasks.filter((t) => !(t.isHomework && (t.folderId ?? null) === (open ?? null)));

  function addToFolder(t: TaskDto) {
    patchTask(t, { isHomework: true, folderId: open ?? null });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setOpen(undefined);
              setAdding(false);
            }}
            className="flex items-center gap-1 rounded-full border border-stone-300/70 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Папки
          </button>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                folder
                  ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300'
                  : 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500'
              }`}
            >
              <FolderIcon className="h-5 w-5" open={!folder} />
            </span>
            <h2 className="text-base font-semibold">
              {folderName}{' '}
              <span className="text-sm font-normal text-stone-400">· {inFolder.length}</span>
            </h2>
          </div>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary text-sm">
          {adding ? 'Готово' : '+ Добавить задания'}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-paper p-3 dark:border-stone-700 dark:bg-stone-900">
          <div className="mb-2 text-xs font-semibold uppercase text-stone-500">
            Выберите задачи из библиотеки — они попадут в «{folderName}»
          </div>
          {candidates.length === 0 ? (
            <div className="text-sm text-stone-500">
              Нет доступных задач. Создайте новые в «Моей библиотеке».
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {candidates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2 dark:border-stone-700 dark:bg-stone-800/40"
                >
                  <MiniBoard fen={t.fen || STARTING_FEN} size={54} flipped={t.sideToPlay === 'b'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <button
                    onClick={() => addToFolder(t)}
                    className="shrink-0 rounded-md bg-brand-500 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    + Сюда
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {inFolder.length === 0 ? (
        <div className="card text-sm text-stone-500">
          В этой папке пока нет заданий. Нажмите «+ Добавить задания».
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {inFolder.map((t) => {
            const diff = DIFFICULTY_LABEL[t.difficulty] ?? DIFFICULTY_LABEL.medium;
            return (
              <li
                key={t.id}
                className="group flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-paper p-2 shadow-sm ring-2 ring-brand-400/70 transition-shadow hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:ring-brand-500/60"
              >
                <div className="flex justify-center">
                  <MiniBoard fen={t.fen || STARTING_FEN} size={140} flipped={t.sideToPlay === 'b'} />
                </div>
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-semibold leading-tight">{t.title}</span>
                  <span
                    className={`ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${diff.tone}`}
                  >
                    {diff.label}
                  </span>
                </div>

                <select
                  value={t.folderId ?? ''}
                  onChange={(e) => patchTask(t, { folderId: e.target.value || null })}
                  className="w-full rounded-md border border-stone-300 bg-stone-50 px-1.5 py-1 text-xs text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                >
                  <option value="">Без папки</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>

                <div className="mt-auto flex items-center gap-1">
                  <button
                    onClick={() => setReportTask(t)}
                    className="flex-1 rounded-md bg-brand-500 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-600"
                  >
                    📊 Отчёт
                  </button>
                  <button
                    onClick={() => patchTask(t, { isHomework: false })}
                    title="Убрать из домашних заданий"
                    className="rounded-md border border-stone-300 px-1.5 py-1 text-[11px] text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    Убрать
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reportTask && <HomeworkReport task={reportTask} onClose={() => setReportTask(null)} />}
    </div>
  );
}

function FolderBlock({
  title,
  count,
  muted,
  onOpen,
  onRename,
  onDelete,
}: {
  title: string;
  count: number;
  muted?: boolean;
  onOpen: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-4 pr-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        muted
          ? 'border-dashed border-stone-300 bg-stone-50/60 dark:border-stone-700 dark:bg-stone-900/40'
          : 'border-stone-200/80 bg-paper dark:border-stone-800/80 dark:bg-stone-900'
      }`}
    >
      <button onClick={onOpen} className="flex w-full min-w-0 items-center gap-3.5 text-left">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
            muted
              ? 'bg-stone-200/70 text-stone-400 dark:bg-stone-800 dark:text-stone-500'
              : 'bg-brand-500/10 text-brand-600 group-hover:bg-brand-500/15 dark:bg-brand-400/10 dark:text-brand-300'
          }`}
        >
          <FolderIcon className="h-6 w-6" open={muted} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">{title}</span>
          <span className="mt-1 inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {count} шт
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-stone-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {(onRename || onDelete) && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onRename && (
            <button
              onClick={onRename}
              title="Переименовать"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-xs text-stone-500 shadow-sm hover:bg-stone-100 hover:text-stone-700 dark:bg-stone-800/90 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Удалить папку"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-xs text-red-500 shadow-sm hover:bg-red-50 dark:bg-stone-800/90 dark:hover:bg-red-900/30"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  );
}
