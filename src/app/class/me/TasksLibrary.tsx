'use client';

import { useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { TaskEditor } from './TaskEditor';
import type { ClassDto } from './ClassSettings';

export interface TaskDto {
  id: string;
  classId: string;
  title: string;
  description: string | null;
  fen: string;
  sideToPlay: string;
  difficulty: string;
  category: string | null;
  goal: string;
  engineLevel: number;
  isPublished: boolean;
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

type Filter = 'all' | 'published' | 'drafts';

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
    return { all: tasks.length, published, drafts };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'published') return tasks.filter((t) => t.isPublished);
    if (filter === 'drafts') return tasks.filter((t) => !t.isPublished);
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
      </div>

      {filteredTasks.length === 0 ? (
        <div className="card text-sm text-stone-500">
          {filter === 'drafts' && counts.published > 0
            ? 'В черновиках пусто. Снимите задачу с публикации — и она вернётся сюда.'
            : filter === 'published' && counts.drafts > 0
              ? 'Ни одна позиция не опубликована. Опубликуйте черновик — и он появится у учеников.'
              : 'Пока нет ни одной позиции. Создайте первую — она сохранится в библиотеку.'}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((t) => {
            const diff = DIFFICULTY_LABEL[t.difficulty] ?? DIFFICULTY_LABEL.medium;
            return (
              <li
                key={t.id}
                className={`card flex flex-col gap-3 ${
                  t.isPublished ? '' : 'opacity-90 ring-1 ring-amber-200/60 dark:ring-amber-800/40'
                }`}
              >
                <div className="flex justify-center">
                  <MiniBoard fen={t.fen || STARTING_FEN} size={140} flipped={t.sideToPlay === 'b'} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${diff.tone}`}>
                    {diff.label}
                  </span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    {GOAL_LABEL[t.goal] ?? t.goal}
                  </span>
                  {t.category && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {t.category}
                    </span>
                  )}
                  {t.isPublished ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      🟢 опубл.
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      📝 черновик
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-stone-500">{t.description}</div>
                  )}
                </div>
                <div className="mt-auto flex gap-2">
                  <button
                    onClick={() => togglePublish(t)}
                    className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                      t.isPublished
                        ? 'border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/30'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                    }`}
                  >
                    {t.isPublished ? 'Снять с публикации' : '↑ Опубликовать'}
                  </button>
                  <button onClick={() => setEditingId(t.id)} className="btn-outline text-xs">
                    ✎
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
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
