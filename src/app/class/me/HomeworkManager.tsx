'use client';

import { useMemo, useState } from 'react';
import {
  CaretLeft,
  Check,
  ChartBar,
  Folder,
  FolderOpen,
  FolderPlus,
  Minus,
  Plus,
  PencilSimple,
  Trash,
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
import { IconButton, StatusChip, ToolButton } from '@/components/room/ui';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import type { FolderDto, TaskDto } from './TasksLibrary';
import { HomeworkReport } from './HomeworkReport';

const DIFFICULTY_LABEL: Record<string, { label: string; tone: 'brand' | 'amber' | 'red' }> = {
  easy: { label: 'легко', tone: 'brand' },
  medium: { label: 'средне', tone: 'amber' },
  hard: { label: 'сложно', tone: 'red' },
};

// Ключ открытой папки: строка = id папки, null = «Без папки», undefined = корень.
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
  const [addingFolder, setAddingFolder] = useState(false);
  const [reportTask, setReportTask] = useState<TaskDto | null>(null);
  const [adding, setAdding] = useState(false);

  const homework = useMemo(() => tasks.filter((t) => t.isHomework), [tasks]);

  const countByFolder = useMemo(() => {
    const map = new Map<string, number>();
    let none = 0;
    for (const t of homework) {
      if (t.folderIds.length) {
        for (const fid of t.folderIds) map.set(fid, (map.get(fid) ?? 0) + 1);
      } else {
        none += 1;
      }
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
        setAddingFolder(false);
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
    if (
      !confirm(
        `Удалить папку «${f.name}»? Задания из неё не удалятся — останутся в других папках или в «Без папки».`,
      )
    )
      return;
    const res = await fetch(`/api/class/me/folders/${f.id}`, { method: 'DELETE' });
    if (res.ok) {
      onFoldersChange(folders.filter((x) => x.id !== f.id));
      onTasksChange(
        tasks.map((t) =>
          t.folderIds.includes(f.id)
            ? { ...t, folderIds: t.folderIds.filter((x) => x !== f.id) }
            : t,
        ),
      );
      if (open === f.id) setOpen(undefined);
    }
  }

  // Оптимистично меняем задачу и синхронизируем с сервером. optimistic — новое
  // локальное состояние, body — тело PATCH (сервер вернёт авторитетный набор).
  async function patchTask(
    t: TaskDto,
    optimistic: Partial<TaskDto>,
    body: Record<string, unknown>,
  ) {
    const prev = tasks;
    onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, ...optimistic } : x)));
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      onTasksChange(prev);
      return;
    }
    // Приводим folderIds к серверному ответу (на случай гонок).
    try {
      const data = (await res.json()) as { task?: TaskDto };
      if (data.task) {
        onTasksChange(
          tasks.map((x) =>
            x.id === t.id ? { ...x, ...optimistic, folderIds: data.task!.folderIds } : x,
          ),
        );
      }
    } catch {
      /* ответ без тела — оставляем оптимистичное состояние */
    }
  }

  /** Переключить принадлежность задачи папке. */
  function toggleFolder(t: TaskDto, folderId: string) {
    if (t.folderIds.includes(folderId)) {
      patchTask(
        t,
        { folderIds: t.folderIds.filter((f) => f !== folderId) },
        { removeFolderId: folderId },
      );
    } else {
      patchTask(
        t,
        { isHomework: true, folderIds: [...t.folderIds, folderId] },
        { isHomework: true, addFolderId: folderId },
      );
    }
  }

  // ── Корень: список папок ──
  if (open === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <SectionHead
          title="Домашние задания"
          count={homework.length}
          hint="Разложите задания по папкам. Внутри папки видно, кто и как их решал."
        >
          {!addingFolder && (
            <ToolButton icon={FolderPlus} size="md" onClick={() => setAddingFolder(true)}>
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
            <ToolButton type="submit" tone="primary" disabled={!newFolderName.trim() || creating}>
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

        {folders.length === 0 && countByFolder.none === 0 ? (
          <EmptyState
            icon={Folder}
            title="Домашних заданий пока нет"
            hint="Отметьте позиции в библиотеке как домашние — они появятся здесь. Папки помогут разложить их по темам."
          >
            <ToolButton icon={FolderPlus} tone="primary" onClick={() => setAddingFolder(true)}>
              Создать папку
            </ToolButton>
          </EmptyState>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((f) => (
              <FolderTile
                key={f.id}
                icon={Folder}
                name={f.name}
                count={countByFolder.map.get(f.id) ?? 0}
                onClick={() => setOpen(f.id)}
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
            <FolderTile
              icon={FolderOpen}
              name="Без папки"
              count={countByFolder.none}
              onClick={() => setOpen(null)}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Внутри папки ──
  const folder = open === null ? null : folders.find((f) => f.id === open) ?? null;
  const folderName = folder ? folder.name : 'Без папки';
  const inFolder =
    open === null
      ? homework.filter((t) => t.folderIds.length === 0)
      : homework.filter((t) => t.folderIds.includes(open));
  // Кандидаты на добавление:
  //   • в реальную папку — всё, чего в ней ещё нет (в том числе домашки из других папок);
  //   • в «Без папки» — задачи, которые ещё не домашки.
  const candidates =
    open === null
      ? tasks.filter((t) => !t.isHomework)
      : tasks.filter((t) => !t.folderIds.includes(open));

  function addToFolder(t: TaskDto) {
    if (open === null) {
      patchTask(t, { isHomework: true }, { isHomework: true });
    } else if (open) {
      patchTask(
        t,
        { isHomework: true, folderIds: [...t.folderIds, open] },
        { isHomework: true, addFolderId: open },
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHead title={folderName} count={inFolder.length}>
        <ToolButton
          icon={adding ? Check : Plus}
          tone={adding ? 'primary' : 'neutral'}
          size="md"
          active={adding}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? 'Готово' : 'Добавить задания'}
        </ToolButton>
        <ToolButton
          icon={CaretLeft}
          size="md"
          onClick={() => {
            setOpen(undefined);
            setAdding(false);
          }}
        >
          Все папки
        </ToolButton>
      </SectionHead>

      {adding && (
        <div
          className={cn(
            'p-2.5',
            'bg-brand-50/80 ring-brand-600/15 dark:bg-brand-950/40 dark:ring-brand-400/20',
            SURFACE,
          )}
        >
          <p className="mb-2 text-[12px] font-semibold text-brand-800 dark:text-brand-100">
            Выберите позиции из библиотеки — они попадут в «{folderName}»
          </p>
          {candidates.length === 0 ? (
            <p className="py-2 text-center text-[12px] text-stone-500 dark:text-stone-400">
              Свободных позиций нет. Создайте новые в библиотеке.
            </p>
          ) : (
            <ul className="grid max-h-[26rem] gap-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => addToFolder(t)}
                    title={`Добавить «${t.title}»`}
                    className="flex w-full items-center gap-2 rounded-xl bg-white/70 p-1.5 text-left ring-1 ring-stone-900/[0.06] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-stone-900/50 dark:ring-white/[0.08] dark:hover:bg-stone-900"
                  >
                    <span className="shrink-0 overflow-hidden rounded-lg ring-1 ring-stone-900/[0.06] dark:ring-white/[0.08]">
                      <MiniBoard fen={t.fen || STARTING_FEN} size={40} flipped={t.sideToPlay === 'b'} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100">
                      {t.title}
                    </span>
                    <span
                      aria-hidden
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-600 text-white"
                    >
                      <Plus size={13} weight="bold" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {inFolder.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="В папке пока нет заданий"
          hint="Нажмите «Добавить задания» и выберите позиции из библиотеки."
        />
      ) : (
        <BoardGrid min="13rem">
          {inFolder.map((t) => {
            const diff = DIFFICULTY_LABEL[t.difficulty] ?? DIFFICULTY_LABEL.medium;
            return (
              <BoardCard
                key={t.id}
                board={
                  <MiniBoard fen={t.fen || STARTING_FEN} fluid flipped={t.sideToPlay === 'b'} />
                }
                badge={<StatusChip tone={diff.tone}>{diff.label}</StatusChip>}
                title={t.title}
                footer={
                  <>
                    <div className="flex items-center gap-1">
                      <FolderPicker
                        className="min-w-0 flex-1"
                        selectedIds={t.folderIds}
                        folders={folders}
                        onToggle={(fid) => toggleFolder(t, fid)}
                      />
                      <IconButton
                        icon={Minus}
                        label={
                          open === null
                            ? 'Убрать из домашних заданий'
                            : 'Убрать из этой папки'
                        }
                        className="!h-7 !w-7 shrink-0"
                        onClick={() => {
                          if (open === null) {
                            patchTask(
                              t,
                              { isHomework: false, folderIds: [] },
                              { isHomework: false },
                            );
                          } else if (open) {
                            toggleFolder(t, open);
                          }
                        }}
                      />
                    </div>
                    <ToolButton
                      icon={ChartBar}
                      tone="primary"
                      block
                      onClick={() => setReportTask(t)}
                      title="Кто из учеников решал и как"
                    >
                      Отчёт
                    </ToolButton>
                  </>
                }
              />
            );
          })}
        </BoardGrid>
      )}

      {reportTask && <HomeworkReport task={reportTask} onClose={() => setReportTask(null)} />}
    </div>
  );
}
