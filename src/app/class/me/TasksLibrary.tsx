'use client';

import { useEffect, useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderTile } from '@/components/ui/FolderTile';
import { FolderPicker } from '@/components/class/FolderPicker';
import { STARTING_FEN } from '@/lib/socket-events';
import { TaskEditor } from './TaskEditor';
import type { ClassDto } from './ClassSettings';

export interface TaskDto {
  id: string;
  classId: string;
  /** Папки ДЗ, в которых лежит задача (может быть несколько; пусто = «Без папки»). */
  folderIds: string[];
  /** Папки «Моей библиотеки» — отдельный от ДЗ набор (может отсутствовать у публичных данных). */
  libraryFolderIds?: string[];
  title: string;
  description: string | null;
  fen: string;
  sideToPlay: string;
  difficulty: string;
  category: string | null;
  goal: string;
  engineLevel: number;
  isPublished: boolean;
  isHomework: boolean;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface FolderDto {
  id: string;
  classId: string;
  name: string;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const DIFFICULTY_LABEL: Record<string, { label: string; tone: string }> = {
  easy: { label: 'легко', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  medium: { label: 'средне', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  hard: { label: 'сложно', tone: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const GOAL_LABEL: Record<string, string> = {
  mate: 'мат',
  'win-material': 'выигрыш материала',
  custom: 'свободная цель',
};

type Filter = 'all' | 'published' | 'drafts' | 'homework';

export function TasksLibrary({
  tasks,
  libraryFolders,
  onTasksChange,
  onLibraryFoldersChange,
}: {
  cls: ClassDto;
  tasks: TaskDto[];
  libraryFolders: FolderDto[];
  onTasksChange: (next: TaskDto[]) => void;
  onLibraryFoldersChange: (next: FolderDto[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // null = корень (папки + позиции без папки); string = открыта папка.
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  // Плитка «+» превратилась в поле ввода названия новой папки.
  const [addingFolder, setAddingFolder] = useState(false);
  // Внутри папки открыт список позиций для добавления (по кнопке «+»).
  const [showAdder, setShowAdder] = useState(false);

  // Папки «Моей библиотеки» у задачи (поле может отсутствовать в публичных данных).
  const libIds = (t: TaskDto) => t.libraryFolderIds ?? [];

  const counts = useMemo(() => {
    const published = tasks.filter((t) => t.isPublished).length;
    const drafts = tasks.length - published;
    const homework = tasks.filter((t) => t.isHomework).length;
    return { all: tasks.length, published, drafts, homework };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'published') return tasks.filter((t) => t.isPublished);
    if (filter === 'drafts') return tasks.filter((t) => !t.isPublished);
    if (filter === 'homework') return tasks.filter((t) => t.isHomework);
    return tasks;
  }, [tasks, filter]);

  // Раскладка по библиотечным папкам (с учётом активного фильтра): счётчики,
  // позиции без папки и содержимое открытой папки.
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filteredTasks) {
      for (const fid of libIds(t)) map.set(fid, (map.get(fid) ?? 0) + 1);
    }
    return map;
  }, [filteredTasks]);
  // Список «Без папки» делаем «залипающим»: пересчитываем набор задач только
  // при навигации (смена фильтра, вход/выход из папки, добавление/удаление
  // задач) — но НЕ при простановке галочек в папки. Иначе задача мгновенно
  // «улетает» из списка после первой галочки, и её нельзя разложить сразу в
  // несколько папок. Галочка теперь просто «копирует» задачу в папку, а сама
  // она остаётся в «Без папки» до следующей навигации.
  const [folderlessIds, setFolderlessIds] = useState<string[]>(() =>
    tasks.filter((t) => (t.libraryFolderIds ?? []).length === 0).map((t) => t.id),
  );
  useEffect(() => {
    setFolderlessIds(
      filteredTasks.filter((t) => (t.libraryFolderIds ?? []).length === 0).map((t) => t.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, openFolder, tasks.length]);
  const folderlessTasks = useMemo(() => {
    const idSet = new Set(folderlessIds);
    return filteredTasks.filter((t) => idSet.has(t.id));
  }, [filteredTasks, folderlessIds]);
  const openFolderObj = openFolder
    ? libraryFolders.find((f) => f.id === openFolder) ?? null
    : null;
  const openFolderTasks = useMemo(() => {
    if (!openFolder) return [];
    const fid = openFolder;
    return filteredTasks.filter((t) => libIds(t).includes(fid));
  }, [filteredTasks, openFolder]);
  // Позиции, которых ещё нет в открытой папке — их можно добавить через «+».
  const addableTasks = useMemo(() => {
    if (!openFolder) return [];
    const fid = openFolder;
    return tasks.filter((t) => !libIds(t).includes(fid));
  }, [tasks, openFolder]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const res = await fetch('/api/class/me/library-folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { folder } = (await res.json()) as { folder: FolderDto };
        onLibraryFoldersChange([...libraryFolders, folder]);
        setNewFolderName('');
        setAddingFolder(false);
      }
    } finally {
      setCreatingFolder(false);
    }
  }

  async function renameFolder(f: FolderDto) {
    const name = prompt('Новое название папки:', f.name)?.trim();
    if (!name || name === f.name) return;
    onLibraryFoldersChange(libraryFolders.map((x) => (x.id === f.id ? { ...x, name } : x)));
    const res = await fetch(`/api/class/me/library-folders/${f.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) onLibraryFoldersChange(libraryFolders);
  }

  async function deleteFolder(f: FolderDto) {
    if (!confirm(`Удалить папку «${f.name}»? Позиции не удалятся — останутся в библиотеке.`)) return;
    const res = await fetch(`/api/class/me/library-folders/${f.id}`, { method: 'DELETE' });
    if (res.ok) {
      onLibraryFoldersChange(libraryFolders.filter((x) => x.id !== f.id));
      onTasksChange(
        tasks.map((t) =>
          libIds(t).includes(f.id)
            ? { ...t, libraryFolderIds: libIds(t).filter((x) => x !== f.id) }
            : t,
        ),
      );
      if (openFolder === f.id) setOpenFolder(null);
    }
  }

  // Добавить/убрать позицию из библиотечной папки (членство), не трогая ДЗ.
  async function toggleTaskFolder(t: TaskDto, folderId: string) {
    const cur = libIds(t);
    const isIn = cur.includes(folderId);
    const nextIds = isIn ? cur.filter((x) => x !== folderId) : [...cur, folderId];
    const prev = tasks;
    onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, libraryFolderIds: nextIds } : x)));
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        isIn ? { removeLibraryFolderId: folderId } : { addLibraryFolderId: folderId },
      ),
    });
    if (!res.ok) onTasksChange(prev);
  }

  function upsert(task: TaskDto, isNew: boolean) {
    if (isNew) {
      onTasksChange([...tasks, task]);
    } else {
      onTasksChange(tasks.map((t) => (t.id === task.id ? task : t)));
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    if (!confirm('Удалить задачу? Это действие необратимо.')) return;
    const res = await fetch(`/api/class/me/tasks/${id}`, { method: 'DELETE' });
    if (res.ok) onTasksChange(tasks.filter((t) => t.id !== id));
  }

  async function togglePublish(t: TaskDto) {
    const next = !t.isPublished;
    // Оптимистично — UI отзывчивее.
    onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, isPublished: next } : x)));
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isPublished: next }),
    });
    if (!res.ok) {
      // Откатываем при ошибке.
      onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, isPublished: !next } : x)));
    }
  }

  // «+» на карточке — добавить задачу в домашние (ученики решают её сами на
  // главной странице класса). Повторное нажатие убирает из домашек.
  async function toggleHomework(t: TaskDto) {
    const next = !t.isHomework;
    // Снятие с ДЗ очищает и папки (сервер делает то же) — иначе задача «вернётся»
    // в старые папки при повторном включении.
    onTasksChange(
      tasks.map((x) =>
        x.id === t.id ? { ...x, isHomework: next, folderIds: next ? x.folderIds : [] } : x,
      ),
    );
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isHomework: next }),
    });
    if (!res.ok) {
      onTasksChange(
        tasks.map((x) => (x.id === t.id ? { ...x, isHomework: !next, folderIds: t.folderIds } : x)),
      );
    }
  }

  const renderCard = (t: TaskDto) => {
    const diff = DIFFICULTY_LABEL[t.difficulty] ?? DIFFICULTY_LABEL.medium;
    const inFolder = !!openFolder;
    const filed = libIds(t).length > 0;
    // Контекстное удаление: внутри папки — убрать только из неё; в «Без папки»
    // у разложенной задачи — просто спрятать из временного списка; удалить
    // задачу целиком можно только когда она не лежит ни в одной папке.
    const removeMode: 'unlinkFolder' | 'hideFolderless' | 'delete' = inFolder
      ? 'unlinkFolder'
      : filed
        ? 'hideFolderless'
        : 'delete';
    const onCardRemove = () => {
      if (removeMode === 'unlinkFolder' && openFolder) {
        if (
          confirm(
            `Убрать «${t.title}» из папки «${openFolderObj?.name ?? ''}»? Позиция останется в библиотеке и в других папках.`,
          )
        ) {
          toggleTaskFolder(t, openFolder);
        }
      } else if (removeMode === 'hideFolderless') {
        setFolderlessIds((ids) => ids.filter((id) => id !== t.id));
      } else {
        remove(t.id);
      }
    };
    return (
      <li
        key={t.id}
        className={`group flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-paper p-2 shadow-sm transition-shadow hover:shadow-md dark:border-stone-700 dark:bg-stone-900 ${
          t.isHomework
            ? 'ring-2 ring-brand-400/70 dark:ring-brand-500/60'
            : t.isPublished
              ? ''
              : 'ring-1 ring-amber-200/60 dark:ring-amber-800/40'
        }`}
      >
        <div className="flex justify-center">
          <MiniBoard fen={t.fen || STARTING_FEN} size={140} flipped={t.sideToPlay === 'b'} />
        </div>
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold leading-tight">{t.title}</span>
          {t.isHomework && (
            <span className="ml-auto shrink-0 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              ДЗ
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase">
          <span className={`rounded px-1 py-0.5 font-semibold ${diff.tone}`}>{diff.label}</span>
          {t.category && (
            <span className="rounded bg-brand-100 px-1 py-0.5 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              {t.category}
            </span>
          )}
          <span className="text-stone-400">·</span>
          <span className="text-stone-500 lowercase">{GOAL_LABEL[t.goal] ?? t.goal}</span>
          <button
            onClick={() => toggleHomework(t)}
            title={t.isHomework ? 'Убрать из домашних заданий' : 'Добавить в домашние задания'}
            className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-base leading-none transition-colors ${
              t.isHomework
                ? 'border-brand-500 bg-brand-500 text-white hover:bg-brand-600'
                : 'border-stone-300 text-stone-500 hover:border-brand-400 hover:text-brand-600 dark:border-stone-600 dark:text-stone-300'
            }`}
          >
            {t.isHomework ? '✓' : '+'}
          </button>
        </div>
        {libraryFolders.length > 0 && (
          <FolderPicker
            selectedIds={libIds(t)}
            folders={libraryFolders}
            onToggle={(fid) => toggleTaskFolder(t, fid)}
          />
        )}
        <div className="mt-auto flex items-center gap-1">
          <button
            onClick={() => togglePublish(t)}
            title={t.isPublished ? 'Снять с публикации' : 'Опубликовать ученикам'}
            className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${
              t.isPublished
                ? 'border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/30'
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
            }`}
          >
            {t.isPublished ? '⤓ В черновики' : '↑ Опубликовать'}
          </button>
          <button
            onClick={() => setEditingId(t.id)}
            title="Редактировать"
            className="rounded-md border border-stone-300 px-1.5 py-1 text-[11px] text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            ✎
          </button>
          <button
            onClick={onCardRemove}
            title={
              removeMode === 'unlinkFolder'
                ? 'Убрать из этой папки (задача останется в библиотеке)'
                : removeMode === 'hideFolderless'
                  ? 'Убрать из «Без папки» (задача уже разложена по папкам)'
                  : 'Удалить задачу полностью'
            }
            className="rounded-md border border-red-300 px-1.5 py-1 text-[11px] text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            {removeMode === 'delete' ? '🗑' : '✕'}
          </button>
        </div>
      </li>
    );
  };

  if (editingId !== null) {
    const task = editingId === 'new' ? null : tasks.find((t) => t.id === editingId) ?? null;
    return (
      <TaskEditor
        task={task}
        onCancel={() => setEditingId(null)}
        onSave={(saved) => upsert(saved, editingId === 'new')}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Моя библиотека позиций</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Сохраняйте сюда любые позиции — черновики остаются только у вас. Когда готовы —
            одним кликом «Опубликовать», и задача появится у учеников в каталоге.
          </p>
        </div>
        <button onClick={() => setEditingId('new')} className="btn-primary text-sm">
          + Новая позиция
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
          Все · {counts.all}
        </FilterTab>
        <FilterTab active={filter === 'published'} onClick={() => setFilter('published')}>
          🟢 Опубликовано · {counts.published}
        </FilterTab>
        <FilterTab active={filter === 'drafts'} onClick={() => setFilter('drafts')}>
          📝 Черновики · {counts.drafts}
        </FilterTab>
        <FilterTab active={filter === 'homework'} onClick={() => setFilter('homework')}>
          📚 Домашние задания · {counts.homework}
        </FilterTab>
      </div>

      {openFolder ? (
        // ── Внутри папки ──
        <div>
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => {
                setOpenFolder(null);
                setShowAdder(false);
              }}
              className="flex items-center gap-1 rounded-full border border-stone-300/70 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Папки
            </button>
            <h3 className="text-base font-semibold">
              {openFolderObj?.name ?? 'Папка'}{' '}
              <span className="text-sm font-normal text-stone-400">· {openFolderTasks.length}</span>
            </h3>
          </div>

          {/* Список позиций для добавления в папку (по кнопке «+»). */}
          {showAdder && (
            <div className="mb-3 rounded-xl border border-brand-300 bg-brand-50/60 p-2.5 dark:border-brand-800 dark:bg-brand-900/20">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Выберите позиции — они добавятся в папку
                </span>
                <button
                  onClick={() => setShowAdder(false)}
                  className="rounded-md px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Готово
                </button>
              </div>
              {addableTasks.length === 0 ? (
                <div className="py-1 text-xs text-stone-500">Все позиции уже в этой папке.</div>
              ) : (
                <ul className="grid max-h-[560px] grid-cols-2 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {addableTasks.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => {
                          if (openFolder) toggleTaskFolder(t, openFolder);
                        }}
                        className="group flex w-full flex-col items-center gap-1 rounded-lg border border-stone-200 bg-paper p-2 shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-300 dark:border-stone-700 dark:bg-stone-900"
                        title={`Добавить «${t.title}» в папку`}
                      >
                        <MiniBoard fen={t.fen || STARTING_FEN} size={168} flipped={t.sideToPlay === 'b'} />
                        <span className="flex w-full items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-stone-700 dark:text-stone-200">
                            {t.title}
                          </span>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm leading-none text-white">
                            +
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Плитка «+» — всегда первой: открывает список позиций для добавления. */}
            <li>
              <button
                type="button"
                onClick={() => setShowAdder((v) => !v)}
                className={`flex h-full min-h-[196px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 transition-colors ${
                  showAdder
                    ? 'border-brand-400 text-brand-500'
                    : 'border-stone-300 text-stone-400 hover:border-brand-400 hover:text-brand-500 dark:border-stone-700'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-current text-2xl leading-none">
                  +
                </span>
                <span className="text-sm font-semibold">Добавить позицию</span>
              </button>
            </li>
            {openFolderTasks.map(renderCard)}
          </ul>
        </div>
      ) : (
        <>
          {/* ── Папки ── */}
          <h3 className="mb-3 text-sm font-semibold text-stone-600 dark:text-stone-300">Папки</h3>
          <ul className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* Плитка «+» — всегда первой: создать папку (клик → ввод названия). */}
            <li>
              {addingFolder ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createFolder();
                  }}
                  className="flex h-full min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-brand-400 p-3"
                >
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAddingFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    placeholder="Название папки"
                    maxLength={60}
                    className="w-full rounded-lg border border-stone-300 bg-paper px-2 py-1.5 text-center text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
                  />
                  <div className="flex gap-1">
                    <button
                      type="submit"
                      disabled={!newFolderName.trim() || creatingFolder}
                      className="btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-50"
                    >
                      Создать
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingFolder(false);
                        setNewFolderName('');
                      }}
                      className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFolder(true)}
                  className="flex h-full min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-3 text-stone-400 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-stone-700"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-current text-2xl leading-none">
                    +
                  </span>
                  <span className="text-sm font-semibold">Новая папка</span>
                </button>
              )}
            </li>
            {libraryFolders.map((f) => (
              <li key={f.id}>
                <FolderTile
                  name={f.name}
                  count={folderCounts.get(f.id) ?? 0}
                  onOpen={() => {
                    setOpenFolder(f.id);
                    setShowAdder(false);
                  }}
                  onRename={() => renameFolder(f)}
                  onDelete={() => deleteFolder(f)}
                />
              </li>
            ))}
          </ul>

          {/* ── Позиции без папки (следуют ниже папок) ── */}
          <h3 className="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-300">
            Без папки <span className="font-normal text-stone-400">· {folderlessTasks.length}</span>
          </h3>
          {folderlessTasks.length === 0 ? (
            <div className="card text-sm text-stone-500">
              {tasks.length === 0
                ? 'Пока нет ни одной позиции. Создайте первую — она сохранится в библиотеку.'
                : 'Все позиции этого фильтра разложены по папкам.'}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {folderlessTasks.map(renderCard)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-brand-500 text-white'
          : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
      }`}
    >
      {children}
    </button>
  );
}
