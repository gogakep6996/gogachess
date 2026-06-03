'use client';

import { useState, type ReactNode } from 'react';
import { useClassSocket } from '@/hooks/useClassSocket';
import { TasksLibrary, type TaskDto } from './TasksLibrary';
import { LessonDashboard, type IntrudeRequest } from './LessonDashboard';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import { RoomClient } from '@/app/room/[code]/RoomClient';
import type { ClassDto } from './ClassSettings';

interface Props {
  meId: string;
  meName: string;
  initialClass: ClassDto;
  initialTasks: TaskDto[];
}

type Tab = 'tasks' | 'lesson';

export function ClassMeClient({ meId, meName, initialClass, initialTasks }: Props) {
  const [cls] = useState<ClassDto>(initialClass);
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks);
  const [tab, setTab] = useState<Tab>('lesson');
  // Вторжение учителя в личную доску ученика. Когда задано — рендерим
  // full-screen RoomClient (учитель = owner student-board комнаты, видит весь
  // тот же UI, что и в «Моей доске», и может редактировать позицию).
  const [intrudeRoom, setIntrudeRoom] = useState<IntrudeRequest | null>(null);

  // Сокет-подключение класса поднимаем здесь, чтобы и левая колонка (LessonDashboard),
  // и правая (аудио + ученики + чат) делили одно и то же состояние.
  const classSocket = useClassSocket(cls.slug);
  const { state, stopDemo, toggleBroadcast } = classSocket;
  const students =
    state?.lobbyParticipants.filter((p) => p.role === 'student') ?? [];

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/class/${cls.slug}`
      : `/class/${cls.slug}`;

  // ============================================================
  // Определяем РЕЖИМ верхней области (что показать в основной колонке).
  //   • intrudeRoom    — учитель за доской ученика;
  //   • demoRoomCode   — открыта «Моя доска» / идёт трансляция классу;
  //   • иначе          — обычный дашборд (табы + урок/библиотека).
  // ПРАВАЯ AsidE-колонка с ClassLobbyPanel — РЕНДЕРИТСЯ ВСЕГДА, чтобы
  // WebRTC mesh не пересобирался при переключении основной области
  // (раньше аудио рвалось у учителя и у учеников при каждом переходе).
  // ============================================================
  const broadcasting = !!state?.demoBroadcast;
  const lessonRightColumn = state?.lessonActive && state.lobbyRoomCode ? (
    <ClassLobbyPanel
      lobbyRoomCode={state.lobbyRoomCode}
      meId={meId}
      isTeacher
      layout="vertical"
      middleSlot={
        <div className="card !p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-stone-500">
            Ученики · {students.length}
          </div>
          {students.length === 0 ? (
            <div className="text-xs text-stone-500">Никто не подключён</div>
          ) : (
            <ul className="space-y-1">
              {students.map((s) => (
                <li
                  key={s.userId}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="truncate">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  ) : (
    <div className="card text-xs text-stone-500">
      Аудио, ученики и чат класса появятся, когда вы начнёте урок.
    </div>
  );

  // ───── Содержимое основной колонки ─────
  let mainColumn: ReactNode;
  let topStatusBar: ReactNode = null;

  if (intrudeRoom) {
    topStatusBar = (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-0.5 text-[11px] font-semibold leading-tight text-stone-700 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-200">
        <span>
          👁 Доска ученика: <span className="font-bold">{intrudeRoom.studentName}</span> —
          всё, что вы делаете, видит ученик
        </span>
        <button
          onClick={() => setIntrudeRoom(null)}
          className="rounded border border-red-300 bg-red-50 px-1.5 py-px text-[10px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          ← Вернуться к классу
        </button>
      </div>
    );
    mainColumn = (
      <RoomClient
        meId={meId}
        meName={meName}
        room={{
          code: intrudeRoom.roomCode,
          name: `Доска: ${intrudeRoom.studentName}`,
          isPublic: false,
          ownerId: meId,
          ownerName: cls.ownerName,
        }}
        embedded
        hideAudioPanel
      />
    );
  } else if (state?.demoRoomCode) {
    topStatusBar = (
      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-0.5 text-[11px] font-semibold leading-tight ${
          broadcasting
            ? 'border-b border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
            : 'border-b border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-200'
        }`}
      >
        <span>
          {broadcasting
            ? '🔴 Идёт трансляция — все ученики видят эту доску'
            : '👀 Моя доска (видна только вам)'}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {broadcasting ? (
            <button
              onClick={() => toggleBroadcast(false)}
              className="rounded border border-stone-300 bg-white px-1.5 py-px text-[10px] font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              ⏸ Остановить трансляцию
            </button>
          ) : (
            <button
              onClick={() => toggleBroadcast(true)}
              className="rounded bg-emerald-500 px-1.5 py-px text-[10px] font-semibold text-white hover:bg-emerald-600"
            >
              📡 Транслировать ученикам
            </button>
          )}
          <button
            onClick={stopDemo}
            className="rounded border border-red-300 bg-red-50 px-1.5 py-px text-[10px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            ← Урок
          </button>
        </div>
      </div>
    );
    mainColumn = (
      <RoomClient
        meId={meId}
        meName={meName}
        room={{
          code: state.demoRoomCode,
          name: broadcasting ? 'Трансляция классу' : 'Моя доска',
          isPublic: false,
          ownerId: meId,
          ownerName: cls.ownerName,
        }}
        embedded
        hideAudioPanel
      />
    );
  } else {
    // Обычный дашборд (вкладки + урок/библиотека)
    mainColumn = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900">
            <div className="font-display text-base font-semibold leading-tight">
              {cls.name || `Класс — ${cls.ownerName}`}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl).catch(() => undefined);
              }}
              title="Скопировать ссылку"
              className="mt-1 block max-w-full truncate rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-left font-mono text-xs text-brand-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-brand-300 dark:hover:bg-stone-700"
            >
              /class/{cls.slug}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <TabButton active={tab === 'lesson'} onClick={() => setTab('lesson')}>
              Урок
            </TabButton>
            <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
              Моя библиотека · {tasks.length}
            </TabButton>
          </div>
        </div>

        {tab === 'lesson' ? (
          <LessonDashboard
            cls={cls}
            tasks={tasks}
            socket={classSocket}
            onIntrude={setIntrudeRoom}
          />
        ) : (
          <TasksLibrary cls={cls} tasks={tasks} onTasksChange={setTasks} />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {topStatusBar}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* ============ ЛЕВАЯ ОСНОВНАЯ КОЛОНКА ============ */}
        <main className="flex min-h-0 min-w-0 flex-col">{mainColumn}</main>
        {/* ============ ПРАВАЯ КОЛОНКА: аудио + ученики + чат ============
            Висит на месте при любых переключениях основной колонки —
            благодаря этому WebRTC mesh не рушится при «вторжении» учителя,
            переходе в «Мою доску»/трансляцию или обратно к дашборду. */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-3 sm:px-4">
          {lessonRightColumn}
        </aside>
      </div>
    </div>
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
      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
      }`}
    >
      {children}
    </button>
  );
}
