'use client';

import { useMemo, useState } from 'react';
import type { useClassSocket } from '@/hooks/useClassSocket';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN, type ClassActiveSessionDto } from '@/lib/socket-events';
import type { ClassDto } from './ClassSettings';
import type { TaskDto } from './TasksLibrary';

export interface IntrudeRequest {
  roomCode: string;
  studentName: string;
}

interface Props {
  cls: ClassDto;
  tasks: TaskDto[];
  /** Сокет-подключение класса. Поднимается родителем (ClassMeClient), чтобы делиться состоянием
   *  с правой колонкой (аудио + ученики + чат). */
  socket: ReturnType<typeof useClassSocket>;
  /** Учитель хочет открыть доску конкретного ученика (вторжение). Родитель
   *  (ClassMeClient) переключится в full-screen RoomClient. */
  onIntrude: (req: IntrudeRequest) => void;
}

export function LessonDashboard({ cls: _cls, tasks, socket, onIntrude }: Props) {
  const { state, connected, startLesson, stopLesson, distribute, startDemo, openMyBoard } =
    socket;
  const [distributeOpen, setDistributeOpen] = useState(false);

  const publishedTasks = useMemo(() => tasks.filter((t) => t.isPublished), [tasks]);
  const currentTask =
    state?.currentTaskId ? tasks.find((t) => t.id === state.currentTaskId) ?? null : null;

  if (!connected) {
    return <div className="card text-sm text-stone-500">Подключаемся к классу…</div>;
  }

  // ============ ОБЫЧНЫЙ ДАШБОРД (action-bar + grid) ============
  // Режимы «Моя доска / Трансляция» и «Вторжение» теперь обрабатываются на
  // уровне ClassMeClient — он полностью замещает дашборд full-screen-видом
  // RoomClient, потому что full-screen-вёрстка должна жить не внутри колонки,
  // а на всё доступное место страницы.
  return (
    <div className="flex flex-col gap-3">
      <ActionBar
        lessonActive={Boolean(state?.lessonActive)}
        onStart={startLesson}
        onStop={stopLesson}
        onBroadcast={() => startDemo(currentTask?.fen)}
        onOpenMyBoard={() => openMyBoard(currentTask?.fen)}
        distributeOpen={distributeOpen}
        onDistributeToggle={() => setDistributeOpen((v) => !v)}
        publishedTasks={publishedTasks}
        currentTaskId={state?.currentTaskId ?? null}
        onDistribute={(id) => {
          distribute(id);
          setDistributeOpen(false);
        }}
      />

      {state?.lessonActive ? (
        <LiveGrid
          sessions={state.sessions}
          onIntrude={(s) =>
            onIntrude({ roomCode: s.roomCode, studentName: s.userName })
          }
        />
      ) : (
        <div className="card text-center text-sm text-stone-500">
          Нажмите «Начать урок» — здесь появятся живые доски всех учеников, которые
          подключились к классу.
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Action-bar: горизонтальный ряд кнопок в одну строку (как на макете)
// ───────────────────────────────────────────────────────────────
function ActionBar({
  lessonActive,
  onStart,
  onStop,
  onBroadcast,
  onOpenMyBoard,
  distributeOpen,
  onDistributeToggle,
  publishedTasks,
  currentTaskId,
  onDistribute,
}: {
  lessonActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onBroadcast: () => void;
  onOpenMyBoard: () => void;
  distributeOpen: boolean;
  onDistributeToggle: () => void;
  publishedTasks: TaskDto[];
  currentTaskId: string | null;
  onDistribute: (id: string) => void;
}) {
  if (!lessonActive) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onStart}
          className="rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          ▶ Начать урок
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onStop}
          className="rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          ■ Завершить урок
        </button>

        <button
          onClick={onDistributeToggle}
          disabled={publishedTasks.length === 0}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            distributeOpen
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-stone-300 bg-paper text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
          }`}
        >
          Раздать задачу классу {distributeOpen ? '▲' : '▼'}
        </button>

        <button
          onClick={onBroadcast}
          className="rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Транслировать ученикам мою доску
        </button>

        <button
          onClick={onOpenMyBoard}
          className="rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Моя доска
        </button>
      </div>

      {distributeOpen && (
        <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-2 dark:border-stone-700 dark:bg-stone-800/40">
          {publishedTasks.length === 0 ? (
            <p className="px-2 py-1 text-xs text-stone-500">
              Нет опубликованных позиций. Опубликуйте позицию в «Моя библиотека».
            </p>
          ) : (
            <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {publishedTasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onDistribute(t.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      t.id === currentTaskId
                        ? 'bg-brand-500 text-white'
                        : 'bg-paper hover:bg-brand-50 dark:bg-stone-900 dark:hover:bg-stone-800'
                    }`}
                  >
                    <MiniBoard fen={t.fen} size={48} flipped={t.sideToPlay === 'b'} />
                    <span className="flex-1 truncate font-semibold">{t.title}</span>
                    {t.id === currentTaskId && <span className="text-[10px]">сейчас</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Live-сетка мини-досок учеников
// ───────────────────────────────────────────────────────────────
function LiveGrid({
  sessions,
  onIntrude,
}: {
  sessions: ClassActiveSessionDto[];
  onIntrude: (s: ClassActiveSessionDto) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="card text-sm text-stone-500">
        Никто пока не получил задачу. Раздайте задачу классу — у каждого присутствующего
        ученика появится его личная доска.
      </div>
    );
  }
  // Стабильный порядок досок: сервер отдаёт сессии по updatedAt (меняется на
  // каждый ход → доски «скачут»). Сортируем по имени ученика, затем по
  // sessionId — порядок фиксирован и не зависит от того, кто только что сходил.
  const ordered = [...sessions].sort(
    (a, b) => a.userName.localeCompare(b.userName, 'ru') || a.sessionId.localeCompare(b.sessionId),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordered.map((s) => (
        <button
          key={s.sessionId}
          onClick={() => onIntrude(s)}
          className="card flex flex-col items-center gap-2 !p-3 text-left transition-shadow hover:shadow-md"
        >
          <MiniBoard fen={s.fen || STARTING_FEN} size={170} />
          <div className="w-full">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.online ? 'bg-emerald-500' : 'bg-stone-400'
                }`}
              />
              <span className="truncate">{s.userName}</span>
              {s.status === 'solved' && (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  ✓
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-stone-500">
              {s.taskTitle} · ходов: {s.movesPlayed}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

