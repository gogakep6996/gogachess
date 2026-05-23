'use client';

import { useState } from 'react';
import { TasksLibrary, type TaskDto } from './TasksLibrary';
import { LessonDashboard } from './LessonDashboard';
import { ClassSettings, type ClassDto } from './ClassSettings';

interface Props {
  meId: string;
  initialClass: ClassDto;
  initialTasks: TaskDto[];
}

type Tab = 'tasks' | 'lesson';

export function ClassMeClient({ meId, initialClass, initialTasks }: Props) {
  const [cls, setCls] = useState<ClassDto>(initialClass);
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks);
  const [tab, setTab] = useState<Tab>('lesson');

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/class/${cls.slug}`
      : `/class/${cls.slug}`;

  return (
    <>
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              {cls.name || `Класс — ${cls.ownerName}`}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Адрес для учеников:{' '}
              <a
                href={`/class/${cls.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-brand-600 hover:underline"
              >
                /class/{cls.slug}
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(publicUrl).catch(() => undefined);
            }}
            className="btn-outline text-xs"
          >
            Скопировать ссылку
          </button>
        </div>
      </header>

      <ClassSettings cls={cls} onUpdate={setCls} />

      <div className="mt-6 mb-4 flex gap-1 border-b border-stone-200/60 dark:border-stone-800/60">
        <TabButton active={tab === 'lesson'} onClick={() => setTab('lesson')}>
          Урок
        </TabButton>
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
          Моя библиотека · {tasks.length}
        </TabButton>
      </div>

      {tab === 'lesson' ? (
        <LessonDashboard meId={meId} cls={cls} tasks={tasks} />
      ) : (
        <TasksLibrary cls={cls} tasks={tasks} onTasksChange={setTasks} />
      )}
    </>
  );
}

function TabButton({
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
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand-500 text-brand-700 dark:text-brand-300'
          : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-200'
      }`}
    >
      {children}
    </button>
  );
}
