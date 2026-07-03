'use client';

import { useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { TaskEditor } from './TaskEditor';
import type { ClassDto } from './ClassSettings';

export interface TaskDto {
  id: string;
  classId: string;
  folderId: string | null;
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
  onTasksChange,
}: {
  cls: ClassDto;
  tasks: TaskDto[];
  onTasksChange: (next: TaskDto[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
    onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, isHomework: next } : x)));
    const res = await fetch(`/api/class/me/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isHomework: next }),
    });
    if (!res.ok) {
      onTasksChange(tasks.map((x) => (x.id === t.id ? { ...x, isHomework: !next } : x)));
    }
  }

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

      {filteredTasks.length === 0 ? (
        <div className="card text-sm text-stone-500">
          {filter === 'homework'
            ? 'Нет домашних заданий. Нажмите «+» на карточке задачи — и она появится у учеников на главной странице класса.'
            : filter === 'drafts' && counts.published > 0
              ? 'В черновиках пусто. Снимите задачу с публикации — и она вернётся сюда.'
              : filter === 'published' && counts.drafts > 0
                ? 'Ни одна позиция не опубликована. Опубликуйте черновик — и он появится у учеников.'
                : 'Пока нет ни одной позиции. Создайте первую — она сохранится в библиотеку.'}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTasks.map((t) => {
            const diff = DIFFICULTY_LABEL[t.difficulty] ?? DIFFICULTY_LABEL.medium;
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
                  <MiniBoard
                    fen={t.fen || STARTING_FEN}
                    size={140}
                    flipped={t.sideToPlay === 'b'}
                  />
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
                  <span className={`rounded px-1 py-0.5 font-semibold ${diff.tone}`}>
                    {diff.label}
                  </span>
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
                    onClick={() => remove(t.id)}
                    title="Удалить"
                    className="rounded-md border border-red-300 px-1.5 py-1 text-[11px] text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
