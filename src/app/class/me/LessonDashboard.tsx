'use client';

import { useMemo, useState } from 'react';
import { useClassSocket } from '@/hooks/useClassSocket';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { LessonBoard } from '@/components/class/LessonBoard';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import type { ClassDto } from './ClassSettings';
import type { TaskDto } from './TasksLibrary';

interface Props {
  meId: string;
  cls: ClassDto;
  tasks: TaskDto[];
}

interface IntrudeState {
  roomCode: string;
  studentName: string;
  humanColor: 'w' | 'b';
  engineLevel: number;
}

export function LessonDashboard({ meId, cls, tasks }: Props) {
  const { state, connected, startLesson, stopLesson, distribute, startDemo, stopDemo } =
    useClassSocket(cls.slug);
  const [intrudeRoom, setIntrudeRoom] = useState<IntrudeState | null>(null);

  const publishedTasks = useMemo(() => tasks.filter((t) => t.isPublished), [tasks]);
  const currentTask =
    state?.currentTaskId ? tasks.find((t) => t.id === state.currentTaskId) ?? null : null;
  const students =
    state?.lobbyParticipants.filter((p) => p.role === 'student') ?? [];
  const teacherOnline =
    state?.lobbyParticipants.some((p) => p.role === 'teacher') ?? false;
  void teacherOnline; // (на будущее — UI индикатор)
  void meId;

  if (!connected) {
    return <div className="card text-sm text-stone-500">Подключаемся к классу…</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Левая колонка: управление уроком */}
      <aside className="flex flex-col gap-3">
        <div className="card">
          {!state?.lessonActive ? (
            <>
              <h3 className="mb-1 text-base font-semibold">Урок не запущен</h3>
              <p className="text-xs text-stone-500">
                Запустите урок — ученики, открытые на странице класса, получат уведомление и
                смогут войти.
              </p>
              <button onClick={startLesson} className="btn-primary mt-3 w-full text-sm">
                ▶ Начать урок
              </button>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-2 text-base font-semibold">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                Идёт урок
              </div>
              <p className="text-xs text-stone-500">
                {students.length === 0
                  ? 'Пока никто не подключился'
                  : `За досками: ${students.length}`}
              </p>
              <button onClick={stopLesson} className="btn-outline mt-3 w-full text-sm">
                ■ Завершить урок
              </button>
            </>
          )}
        </div>

        {/* Ростер */}
        {state?.lessonActive && (
          <div className="card">
            <h4 className="mb-2 text-xs font-semibold uppercase text-stone-500">Ученики</h4>
            {students.length === 0 ? (
              <div className="text-xs text-stone-500">Никто не пришёл</div>
            ) : (
              <ul className="space-y-1">
                {students.map((s) => (
                  <li key={s.userId} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Раздача задач */}
        {state?.lessonActive && (
          <div className="card">
            <h4 className="mb-2 text-xs font-semibold uppercase text-stone-500">
              Раздать задачу классу
            </h4>
            {currentTask && (
              <div className="mb-2 rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                Сейчас раздана: <b>{currentTask.title}</b>
              </div>
            )}
            {publishedTasks.length === 0 ? (
              <div className="text-xs text-stone-500">
                Нет опубликованных позиций. Откройте «Моя библиотека» и нажмите «↑ Опубликовать»
                на нужной позиции — она появится здесь.
              </div>
            ) : (
              <ul className="grid gap-1 max-h-72 overflow-y-auto">
                {publishedTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => distribute(t.id)}
                      className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        t.id === state.currentTaskId
                          ? 'bg-brand-500 text-white'
                          : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Демонстрация классу */}
        {state?.lessonActive && (
          <div className="card">
            <h4 className="mb-2 text-xs font-semibold uppercase text-stone-500">
              Показ классу
            </h4>
            <p className="mb-2 text-xs text-stone-500">
              Перебивает личные доски учеников на время показа. Звук и чат продолжают
              работать.
            </p>
            {state.demoRoomCode ? (
              <button onClick={stopDemo} className="btn-outline w-full text-sm">
                Закрыть показ
              </button>
            ) : (
              <button
                onClick={() => startDemo(currentTask?.fen)}
                className="btn-primary w-full text-sm"
              >
                Показать всем
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Центральная часть: live grid + intrusion + лобби-канал */}
      <section className="flex flex-col gap-4">
        {/* Аудио + чат класса работает всегда, пока активен урок */}
        {state?.lessonActive && state.lobbyRoomCode && (
          <ClassLobbyPanel
            lobbyRoomCode={state.lobbyRoomCode}
            meId={meId}
            isTeacher
          />
        )}

        {/* Демо-доска: учитель сам играет/редактирует на доске показа */}
        {state?.lessonActive && state.demoRoomCode && !intrudeRoom && (
          <LessonBoard
            roomCode={state.demoRoomCode}
            meId={meId}
            variant="demo"
            caption="Доска показа (видна всем ученикам)"
          />
        )}

        {intrudeRoom ? (
          <LessonBoard
            roomCode={intrudeRoom.roomCode}
            meId={meId}
            variant="task"
            humanColor={intrudeRoom.humanColor}
            engineSkill={intrudeRoom.engineLevel}
            caption={`Доска ученика: ${intrudeRoom.studentName}`}
            onExit={() => setIntrudeRoom(null)}
            exitLabel="← Назад к сетке"
          />
        ) : state?.lessonActive ? (
          <LiveGrid
            sessions={state.sessions}
            tasks={tasks}
            onIntrude={(s) => {
              const task = tasks.find((t) => t.id === s.taskId);
              setIntrudeRoom({
                roomCode: s.roomCode,
                studentName: s.userName,
                humanColor: (task?.sideToPlay as 'w' | 'b') ?? 'w',
                engineLevel: task?.engineLevel ?? 10,
              });
            }}
          />
        ) : (
          <div className="card text-center text-sm text-stone-500">
            Когда вы начнёте урок, здесь появится сетка с досками всех присутствующих учеников.
          </div>
        )}
      </section>
    </div>
  );
}

function LiveGrid({
  sessions,
  tasks,
  onIntrude,
}: {
  sessions: import('@/lib/socket-events').ClassActiveSessionDto[];
  tasks: TaskDto[];
  onIntrude: (s: import('@/lib/socket-events').ClassActiveSessionDto) => void;
}) {
  void tasks;
  if (sessions.length === 0) {
    return (
      <div className="card text-sm text-stone-500">
        Никто пока не начал решать задачу. Раздайте задачу слева — у каждого присутствующего
        ученика появится его личная доска.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => (
        <button
          key={s.sessionId}
          onClick={() => onIntrude(s)}
          className="card flex flex-col items-center gap-2 text-left transition-shadow hover:shadow-md"
        >
          <MiniBoard fen={s.fen || STARTING_FEN} size={160} />
          <div className="w-full">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.online ? 'bg-emerald-500' : 'bg-stone-400'
                }`}
              />
              <span className="truncate">{s.userName}</span>
              {s.status === 'solved' && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  ✓ решено
                </span>
              )}
            </div>
            <div className="text-xs text-stone-500">
              ходов: {s.movesPlayed} · {s.taskTitle}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
