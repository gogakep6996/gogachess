'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUUpLeft,
  CaretLeft,
  Check,
  CloudArrowUp,
  Folder,
  FolderPlus,
  House,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderPicker } from '@/components/class/FolderPicker';
import {
  BoardCard,
  BoardGrid,
  EmptyState,
  FolderTile,
  SectionHead,
  SURFACE,
} from '@/components/class/ui';
import { IconButton, Segmented, StatusChip, ToolButton } from '@/components/room/ui';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
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

const DIFFICULTY_LABEL: Record<string, { label: string; tone: 'brand' | 'amber' | 'red' }> = {
  easy: { label: 'легко', tone: 'brand' },
  medium: { label: 'средне', tone: 'amber' },
  hard: { label: 'сложно', tone: 'red' },
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
  // Внутри папки открыт список позиций для добавления.
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

  // Раскладка по библиотечным папкам (с учётом активного фильтра).
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
  // несколько папок. Галочка просто «копирует» задачу в папку, а сама она
  // остаётся в «Без папки» до следующей навигации.
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

  const openFolderObj = openFolder ? libraryFolders.find((f) => f.id === openFolder) ?? null : null;

  const openFolderTasks = useMemo(() => {
    if (!openFolder) return [];
    const fid = openFolder;
    return filteredTasks.filter((t) => libIds(t).includes(fid));
  }, [filteredTasks, openFolder]);

  // Позиции, которых ещё нет в открытой папке.
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
      onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, isPublished: !next } : x)));
    }
  }

  // Добавить задачу в домашние (ученики решают её сами на главной класса).
  // Повторное нажатие убирает из домашек.
  async function toggleHomework(t: TaskDto) {
    const next = !t.isHomework;
    // Снятие с ДЗ очищает и папки (сервер делает то же) — иначе задача
    // «вернётся» в старые папки при повторном включении.
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
    // у разложенной задачи — спрятать из временного списка; удалить задачу
    // целиком можно только когда она не лежит ни в одной папке.
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
      <BoardCard
        key={t.id}
        active={t.isHomework}
        board={<MiniBoard fen={t.fen || STARTING_FEN} fluid flipped={t.sideToPlay === 'b'} />}
        badge={
          <>
            <StatusChip tone={diff.tone}>{diff.label}</StatusChip>
            {!t.isPublished && <StatusChip tone="neutral">черновик</StatusChip>}
          </>
        }
        title={t.title}
        meta={
          <>
            <span className="truncate">{GOAL_LABEL[t.goal] ?? t.goal}</span>
            {t.category && <span className="truncate">· {t.category}</span>}
          </>
        }
        actions={
          <div className="flex gap-0.5 rounded-lg bg-white/90 p-0.5 shadow-sm ring-1 ring-stone-900/10 backdrop-blur dark:bg-stone-800/90 dark:ring-white/15">
            <IconButton
              icon={PencilSimple}
              label="Редактировать позицию"
              onClick={() => setEditingId(t.id)}
            />
            <IconButton
              icon={removeMode === 'delete' ? Trash : X}
              label={
                removeMode === 'unlinkFolder'
                  ? 'Убрать из этой папки — позиция останется в библиотеке'
                  : removeMode === 'hideFolderless'
                    ? 'Убрать из «Без папки» — позиция уже разложена по папкам'
                    : 'Удалить позицию совсем'
              }
              tone={removeMode === 'delete' ? 'danger' : 'quiet'}
              onClick={onCardRemove}
            />
          </div>
        }
        footer={
          <>
            <div className="flex items-center gap-1">
              <FolderPicker
                className="min-w-0 flex-1"
                selectedIds={libIds(t)}
                folders={libraryFolders}
                onToggle={(fid) => toggleTaskFolder(t, fid)}
              />
              <IconButton
                icon={t.isHomework ? Check : House}
                label={t.isHomework ? 'Убрать из домашних заданий' : 'Добавить в домашние задания'}
                active={t.isHomework}
                className="!h-7 !w-7 shrink-0"
                onClick={() => toggleHomework(t)}
              />
            </div>
            <ToolButton
              icon={t.isPublished ? ArrowUUpLeft : CloudArrowUp}
              tone={t.isPublished ? 'neutral' : 'primary'}
              block
              onClick={() => togglePublish(t)}
              title={
                t.isPublished
                  ? 'Снять с публикации — ученики перестанут видеть позицию'
                  : 'Опубликовать — позицию можно будет раздать классу'
              }
            >
              {t.isPublished ? 'В черновики' : 'Опубликовать'}
            </ToolButton>
          </>
        }
      />
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
    <div className="flex flex-col gap-3">
      <SectionHead
        title="Библиотека позиций"
        hint="Черновики видите только вы. Опубликованную позицию можно раздать классу на уроке."
      >
        <ToolButton icon={Plus} tone="primary" size="md" onClick={() => setEditingId('new')}>
          Новая позиция
        </ToolButton>
      </SectionHead>

      <Segmented
        ariaLabel="Фильтр позиций"
        className="sm:max-w-xl"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: `Все · ${counts.all}` },
          { id: 'published', label: `Опубликованы · ${counts.published}` },
          { id: 'drafts', label: `Черновики · ${counts.drafts}` },
          { id: 'homework', label: `Домашние · ${counts.homework}` },
        ]}
      />

      {openFolder ? (
        // ── Внутри папки ──
        <div className="flex flex-col gap-2.5">
          <SectionHead title={openFolderObj?.name ?? 'Папка'} count={openFolderTasks.length}>
            <ToolButton
              icon={Plus}
              tone={showAdder ? 'primary' : 'neutral'}
              active={showAdder}
              onClick={() => setShowAdder((v) => !v)}
            >
              Добавить позиции
            </ToolButton>
            <ToolButton
              icon={CaretLeft}
              onClick={() => {
                setOpenFolder(null);
                setShowAdder(false);
              }}
            >
              Все папки
            </ToolButton>
          </SectionHead>

          {showAdder && (
            <div
              className={cn(
                'p-2.5',
                'bg-brand-50/80 ring-brand-600/15 dark:bg-brand-950/40 dark:ring-brand-400/20',
                SURFACE,
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-brand-800 dark:text-brand-100">
                  Нажмите на позицию — она добавится в папку
                </span>
                <ToolButton icon={Check} onClick={() => setShowAdder(false)}>
                  Готово
                </ToolButton>
              </div>
              {addableTasks.length === 0 ? (
                <p className="py-2 text-center text-[12px] text-stone-500 dark:text-stone-400">
                  Все позиции уже в этой папке.
                </p>
              ) : (
                <div className="max-h-[34rem] overflow-y-auto overscroll-contain pr-0.5">
                  <BoardGrid min="9rem">
                    {addableTasks.map((t) => (
                      <BoardCard
                        key={t.id}
                        board={
                          <MiniBoard
                            fen={t.fen || STARTING_FEN}
                            fluid
                            flipped={t.sideToPlay === 'b'}
                          />
                        }
                        title={t.title}
                        tooltip={`Добавить «${t.title}» в папку`}
                        onClick={() => {
                          if (openFolder) toggleTaskFolder(t, openFolder);
                        }}
                      />
                    ))}
                  </BoardGrid>
                </div>
              )}
            </div>
          )}

          {openFolderTasks.length === 0 ? (
            <EmptyState
              icon={Folder}
              title="В папке пока пусто"
              hint="Нажмите «Добавить позиции» и выберите, что сюда положить."
            />
          ) : (
            <BoardGrid min="13rem">{openFolderTasks.map(renderCard)}</BoardGrid>
          )}
        </div>
      ) : (
        <>
          {/* ── Папки ── */}
          <div className="flex flex-col gap-2.5">
            <SectionHead title="Папки" count={libraryFolders.length}>
              {!addingFolder && (
                <ToolButton icon={FolderPlus} onClick={() => setAddingFolder(true)}>
                  Новая папка
                </ToolButton>
              )}
            </SectionHead>

            {addingFolder && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createFolder();
                }}
                className={cn('flex items-center gap-1.5 p-2', SURFACE)}
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
                  aria-label="Название папки"
                  maxLength={60}
                  className="h-8 min-w-0 flex-1 rounded-xl border-0 bg-stone-900/[0.05] px-2.5 text-[12px] text-stone-800 outline-none ring-1 ring-inset ring-transparent transition placeholder:text-stone-400 focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800"
                />
                <ToolButton
                  type="submit"
                  tone="primary"
                  disabled={!newFolderName.trim() || creatingFolder}
                >
                  Создать
                </ToolButton>
                <ToolButton
                  onClick={() => {
                    setAddingFolder(false);
                    setNewFolderName('');
                  }}
                >
                  Отмена
                </ToolButton>
              </form>
            )}

            {libraryFolders.length > 0 && (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {libraryFolders.map((f) => (
                  <FolderTile
                    key={f.id}
                    icon={Folder}
                    name={f.name}
                    count={folderCounts.get(f.id) ?? 0}
                    onClick={() => {
                      setOpenFolder(f.id);
                      setShowAdder(false);
                    }}
                  >
                    <IconButton
                      icon={PencilSimple}
                      label="Переименовать папку"
                      className="!h-7 !w-7"
                      onClick={() => renameFolder(f)}
                    />
                    <IconButton
                      icon={Trash}
                      label="Удалить папку"
                      tone="danger"
                      className="!h-7 !w-7"
                      onClick={() => deleteFolder(f)}
                    />
                  </FolderTile>
                ))}
              </div>
            )}
          </div>

          {/* ── Позиции без папки ── */}
          <div className="flex flex-col gap-2.5">
            <SectionHead title="Без папки" count={folderlessTasks.length} />
            {folderlessTasks.length === 0 ? (
              <EmptyState
                icon={Folder}
                title={tasks.length === 0 ? 'Библиотека пуста' : 'Всё разложено по папкам'}
                hint={
                  tasks.length === 0
                    ? 'Создайте первую позицию — она сохранится сюда.'
                    : 'В этом фильтре не осталось позиций вне папок.'
                }
              >
                {tasks.length === 0 && (
                  <ToolButton icon={Plus} tone="primary" onClick={() => setEditingId('new')}>
                    Новая позиция
                  </ToolButton>
                )}
              </EmptyState>
            ) : (
              <BoardGrid min="13rem">{folderlessTasks.map(renderCard)}</BoardGrid>
            )}
          </div>
        </>
      )}
    </div>
  );
}
