'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { useClassSocket } from '@/hooks/useClassSocket';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import { RoomClient } from '@/app/room/[code]/RoomClient';
import type { TaskDto } from '../me/TasksLibrary';

interface ClassDto {
  id: string;
  slug: string;
  name: string | null;
  ownerId: string;
  ownerName: string;
  hasAccessCode: boolean;
}

interface Props {
  meId: string | null;
  meName: string | null;
  cls: ClassDto;
  initialTasks: TaskDto[];
  isOwner: boolean;
}

const CODE_STORAGE_KEY = (slug: string) => `class-access:${slug}`;

const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};
const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'легко',
  medium: 'средне',
  hard: 'сложно',
};

export function ClassPublicClient({ meId, meName, cls, initialTasks, isOwner }: Props) {
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks);
  const [codeNeeded, setCodeNeeded] = useState(cls.hasAccessCode && !isOwner && tasks.length === 0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // Подписка на live-состояние класса — для баннера «идёт урок» и редиректов на доску.
  const { state, connected } = useClassSocket(cls.slug);
  void connected;

  // При первом маунте — пробуем взять сохранённый код из localStorage.
  useEffect(() => {
    if (!cls.hasAccessCode || isOwner) return;
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem(CODE_STORAGE_KEY(cls.slug)) : null;
    if (saved) {
      tryCode(saved, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryCode(value: string, persist: boolean) {
    const res = await fetch(`/api/class/${cls.slug}?code=${encodeURIComponent(value)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      setCodeError('Ошибка запроса');
      return;
    }
    const data = (await res.json()) as { codeAccepted: boolean; tasks: TaskDto[] };
    if (data.codeAccepted) {
      setTasks(data.tasks);
      setCodeNeeded(false);
      setCodeError(null);
      if (persist) {
        window.localStorage.setItem(CODE_STORAGE_KEY(cls.slug), value);
      }
    } else {
      setCodeError('Неверный код');
    }
  }

  // Какую доску показывать ученику прямо сейчас:
  //  - демо (приоритет): учитель ведёт показ всем;
  //  - личная доска задачи (если уже раздана и есть сессия с roomCode);
  //  - иначе nothing → показываем витрину задач.
  const activeBoard = useMemo(() => {
    if (!state) return null;
    // Демо-доска видна ученикам ТОЛЬКО при включённой трансляции.
    // Если у учителя просто открыта «Моя доска» (demoBroadcast=false) — ученики
    // продолжают работать со своими задачами.
    if (state.lessonActive && state.demoRoomCode && state.demoBroadcast) {
      return { kind: 'demo' as const, roomCode: state.demoRoomCode };
    }
    if (state.lessonActive && meId) {
      const session = state.sessions.find((s) => s.userId === meId);
      if (session) {
        return {
          kind: 'task' as const,
          roomCode: session.roomCode,
          taskTitle: session.taskTitle,
          taskId: session.taskId,
        };
      }
    }
    return null;
  }, [state, meId]);

  const currentTaskForSide =
    activeBoard?.kind === 'task'
      ? tasks.find((t) => t.id === activeBoard.taskId)
      : undefined;

  // ============================================================
  // FULL-SCREEN РЕЖИМ: ученик решает задачу ИЛИ смотрит трансляцию учителя.
  // Тот же layout, что у учителя в «Моей доске», просто без редактора/движка
  // (они и так скрыты для не-владельцев комнаты).
  // ============================================================
  if (activeBoard && meId) {
    const isDemo = activeBoard.kind === 'demo';
    const humanColor: 'w' | 'b' =
      activeBoard.kind === 'task'
        ? ((currentTaskForSide?.sideToPlay as 'w' | 'b') ?? 'w')
        : 'w';
    return (
      <>
        {/* Тонкая верхняя полоска: статус + название задачи. */}
        <div
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-0.5 text-[11px] font-semibold leading-tight ${
            isDemo
              ? 'border-b border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
              : 'border-b border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-200'
          }`}
        >
          <span>
            {isDemo
              ? '🔴 Учитель транслирует свою доску — следите за разбором'
              : `🎯 Задача: ${activeBoard.kind === 'task' ? activeBoard.taskTitle : ''}`}
          </span>
          <span className="text-[10px] text-stone-500 dark:text-stone-400">
            {cls.name || `Класс — ${cls.ownerName}`}
          </span>
        </div>

        <RoomClient
          meId={meId}
          meName={meName ?? ''}
          room={{
            code: activeBoard.roomCode,
            name:
              activeBoard.kind === 'task'
                ? activeBoard.taskTitle
                : 'Показ учителя',
            isPublic: false,
            ownerId: cls.ownerId, // owner — учитель; ученик = не-owner
            ownerName: cls.ownerName,
          }}
          embedded
          // Включаем «vs computer» только в режиме задачи. В демо учитель ведёт
          // разбор сам, движок не нужен.
          studentTaskMode={
            activeBoard.kind === 'task' ? { humanColor } : undefined
          }
        />
      </>
    );
  }

  // ============================================================
  // ОБЫЧНЫЙ ЛЕНДИНГ КЛАССА — то же расположение, что у учителя:
  //   • левая основная колонка: «шапка» класса + сетка задач (где у учителя
  //     живут мини-доски учеников);
  //   • правая колонка 240px: аудио + список участников + чат класса
  //     (только во время активного урока).
  // ============================================================
  const lobbyParticipants = state?.lobbyParticipants ?? [];

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="grid gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* ============ ЛЕВАЯ ОСНОВНАЯ КОЛОНКА ============ */}
        <main className="flex flex-col gap-3">
          {/* Шапка класса — компактная карточка с названием и учителем,
              как у учителя на дашборде. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900">
              <div className="font-display text-base font-semibold leading-tight">
                {cls.name || `Класс — ${cls.ownerName}`}
              </div>
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                Учитель: {cls.ownerName}
              </div>
            </div>
            {isOwner && (
              <Link href="/class/me" className="btn-outline text-xs">
                Управлять классом →
              </Link>
            )}
          </div>

          {/* Баннер активного урока (как небольшое info-сообщение) */}
          {state?.lessonActive && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs dark:border-emerald-700 dark:bg-emerald-900/30">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Идёт урок. Учитель раздаст задачу — она откроется на вашей личной доске.
              </div>
              {!meId && (
                <Link href="/login" className="text-xs underline">
                  Войдите, чтобы участвовать
                </Link>
              )}
            </div>
          )}

          {codeNeeded ? (
            <div className="card max-w-md">
              <h2 className="text-base font-semibold">Введите код доступа</h2>
              <p className="mt-1 text-xs text-stone-500">
                Учитель выдал вам код для входа в этот класс.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="например 1234"
                  className="flex-1 rounded border border-stone-300 bg-white px-3 py-1.5 font-mono dark:border-stone-700 dark:bg-stone-900"
                />
                <button onClick={() => tryCode(code, true)} className="btn-primary text-sm">
                  Войти
                </button>
              </div>
              {codeError && <div className="mt-2 text-xs text-red-600">{codeError}</div>}
            </div>
          ) : (
            <>
              <h2 className="mt-1 text-base font-semibold">
                Задачи учителя · {tasks.length}
              </h2>
              {/* Сетка задач — той же геометрии, что у учителя для досок учеников
                  (sm:2 / lg:3 / xl:4). Карточка задачи похожа на LiveGrid-карточку:
                  мини-доска сверху, краткие метаданные снизу. */}
              {tasks.length === 0 ? (
                <div className="card text-sm text-stone-500">
                  В этом классе пока нет задач. Возвращайтесь позже!
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="card flex flex-col items-center gap-2 !p-3 text-left"
                    >
                      <MiniBoard
                        fen={t.fen || STARTING_FEN}
                        size={170}
                        flipped={t.sideToPlay === 'b'}
                      />
                      <div className="w-full">
                        <div className="truncate text-sm font-semibold">{t.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] uppercase">
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                              DIFFICULTY_TONE[t.difficulty] ?? DIFFICULTY_TONE.medium
                            }`}
                          >
                            {DIFFICULTY_LABEL[t.difficulty] ?? t.difficulty}
                          </span>
                          {t.category && (
                            <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                              {t.category}
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <div className="mt-1 line-clamp-2 text-[11px] text-stone-500">
                            {t.description}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>

        {/* ============ ПРАВАЯ КОЛОНКА: аудио + участники + чат ============
            Один в один как у учителя в ClassMeClient — общая ширина 240px,
            ClassLobbyPanel в вертикальной раскладке, в середину пробрасываем
            ростер. До старта урока — лаконичный плейсхолдер. */}
        <aside className="flex flex-col gap-3">
          {state?.lessonActive && state.lobbyRoomCode && meId ? (
            <ClassLobbyPanel
              lobbyRoomCode={state.lobbyRoomCode}
              meId={meId}
              isTeacher={isOwner}
              layout="vertical"
              middleSlot={
                <div className="card !p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-stone-500">
                    Участники · {lobbyParticipants.length}
                  </div>
                  {lobbyParticipants.length === 0 ? (
                    <div className="text-xs text-stone-500">Никто не подключён</div>
                  ) : (
                    <ul className="space-y-1">
                      {lobbyParticipants.map((p) => (
                        <li
                          key={p.userId}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              p.role === 'teacher' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                          <span className="truncate">{p.name}</span>
                          {p.role === 'teacher' && (
                            <span className="ml-auto text-[10px] uppercase text-amber-600 dark:text-amber-300">
                              учитель
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              }
            />
          ) : (
            <div className="card text-xs text-stone-500">
              Аудио, участники и чат класса появятся, когда учитель начнёт урок.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
