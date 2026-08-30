'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretDown,
  CheckCircle,
  ChalkboardTeacher,
  Broadcast,
  LockKey,
  LockKeyOpen,
  MagnifyingGlass,
  Play,
  Stop,
  Student,
  SquaresFour,
} from '@phosphor-icons/react';
import type { useClassSocket } from '@/hooks/useClassSocket';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN, type ClassActiveSessionDto } from '@/lib/socket-events';
import { BoardCard, BoardGrid, EmptyState, POPOVER, SURFACE } from '@/components/class/ui';
import { StatusChip, ToolButton } from '@/components/room/ui';
import { cn } from '@/lib/utils';
import type { ClassDto } from './ClassSettings';
import type { TaskDto } from './TasksLibrary';

export interface IntrudeRequest {
  roomCode: string;
  studentName: string;
}

interface Props {
  cls: ClassDto;
  tasks: TaskDto[];
  /** Сокет-подключение класса. Поднимается родителем (ClassMeClient), чтобы
   *  делиться состоянием с правой колонкой (аудио + чат). */
  socket: ReturnType<typeof useClassSocket>;
  /** Учитель хочет открыть доску конкретного ученика (вторжение). Родитель
   *  переключится в full-screen RoomClient. */
  onIntrude: (req: IntrudeRequest) => void;
}

export function LessonDashboard({ cls: _cls, tasks, socket, onIntrude }: Props) {
  const {
    state,
    connected,
    startLesson,
    stopLesson,
    distribute,
    startDemo,
    openMyBoard,
    toggleDoor,
  } = socket;

  const publishedTasks = useMemo(() => tasks.filter((t) => t.isPublished), [tasks]);
  const currentTask = state?.currentTaskId
    ? tasks.find((t) => t.id === state.currentTaskId) ?? null
    : null;

  if (!connected) {
    return (
      <div className={cn('px-4 py-6 text-center text-[13px] text-stone-500', SURFACE)}>
        Подключаемся к классу…
      </div>
    );
  }

  const lessonActive = Boolean(state?.lessonActive);
  const sessions = state?.sessions ?? [];

  if (!lessonActive) {
    return (
      <EmptyState
        icon={ChalkboardTeacher}
        title="Урок не идёт"
        hint="Начните урок — ученики смогут войти, включить микрофоны, а вы раздадите каждому его личную доску."
      >
        <ToolButton icon={Play} tone="primary" size="md" onClick={startLesson}>
          Начать урок
        </ToolButton>
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <LessonBar
        onStop={stopLesson}
        onBroadcast={() => startDemo(currentTask?.fen)}
        onOpenMyBoard={() => openMyBoard(currentTask?.fen)}
        publishedTasks={publishedTasks}
        currentTaskId={state?.currentTaskId ?? null}
        onDistribute={distribute}
        doorClosed={Boolean(state?.joinsClosed)}
        onToggleDoor={toggleDoor}
        admittedCount={state?.admittedIds.length ?? 0}
      />

      <LessonSummary sessions={sessions} currentTask={currentTask} />

      {sessions.length === 0 ? (
        <EmptyState
          icon={SquaresFour}
          title="Досок пока нет"
          hint="Раздайте задачу классу — у каждого ученика, кто сейчас на уроке, появится личная доска, и вы будете видеть её вживую."
        />
      ) : (
        <LiveGrid
          sessions={sessions}
          onIntrude={(s) => onIntrude({ roomCode: s.roomCode, studentName: s.userName })}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Пульт урока: одна строка, всегда на месте
// ───────────────────────────────────────────────────────────────

/**
 * Кнопки управления уроком. Раздача задачи — главное действие, поэтому она
 * первая и в бренде; список позиций открывается поповером поверх сетки, а не
 * вставкой в поток: иначе доски учеников подпрыгивают вниз при каждом клике.
 */
function LessonBar({
  onStop,
  onBroadcast,
  onOpenMyBoard,
  publishedTasks,
  currentTaskId,
  onDistribute,
  doorClosed,
  onToggleDoor,
  admittedCount,
}: {
  onStop: () => void;
  onBroadcast: () => void;
  onOpenMyBoard: () => void;
  publishedTasks: TaskDto[];
  currentTaskId: string | null;
  onDistribute: (id: string) => void;
  doorClosed: boolean;
  onToggleDoor: (closed: boolean) => void;
  admittedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publishedTasks;
    return publishedTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [publishedTasks, query]);

  return (
    // Полоса поднята над сеткой: backdrop-blur у карточек создаёт свой
    // контекст наложения, поэтому без z-index здесь доски перекрыли бы
    // выпадающий список раздачи.
    <div
      className={cn(
        'relative z-20 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 p-2',
        SURFACE,
      )}
    >
      <StatusChip tone="brand" live>
        Урок идёт
      </StatusChip>

      <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-stone-900/10 sm:block dark:bg-white/10" />

      <div ref={anchorRef} className="relative">
        <ToolButton
          icon={Student}
          tone="primary"
          size="md"
          active={open}
          disabled={publishedTasks.length === 0}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          title={
            publishedTasks.length === 0
              ? 'Сначала опубликуйте позицию в библиотеке'
              : 'Открыть каждому ученику его личную доску с этой задачей'
          }
        >
          Раздать задачу
          <CaretDown
            size={13}
            weight="bold"
            aria-hidden
            className={cn('transition-transform duration-150', open && 'rotate-180')}
          />
        </ToolButton>

        {open && (
          <>
            {/* Клик мимо закрывает список. Слой ниже поповера, но выше сетки. */}
            <div
              className="fixed inset-0 z-30"
              aria-hidden
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              className={cn(
                'absolute left-0 top-full z-40 mt-1.5 w-[min(88vw,30rem)] p-2',
                POPOVER,
              )}
            >
              <label className="relative mb-2 block">
                <MagnifyingGlass
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Найти позицию"
                  aria-label="Поиск позиции"
                  className="h-8 w-full rounded-xl border-0 bg-stone-900/[0.05] pl-8 pr-2.5 text-[12px] text-stone-800 outline-none ring-1 ring-inset ring-transparent transition placeholder:text-stone-400 focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800"
                />
              </label>

              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-stone-500 dark:text-stone-400">
                  {publishedTasks.length === 0
                    ? 'Нет опубликованных позиций. Опубликуйте позицию в библиотеке.'
                    : 'Ничего не нашлось.'}
                </p>
              ) : (
                <ul className="max-h-[min(50vh,20rem)] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                  {filtered.map((t) => {
                    const current = t.id === currentTaskId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onDistribute(t.id);
                            setOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
                            current
                              ? 'bg-brand-50 dark:bg-brand-950/50'
                              : 'hover:bg-stone-900/[0.05] dark:hover:bg-white/[0.07]',
                          )}
                        >
                          <span className="shrink-0 overflow-hidden rounded-lg ring-1 ring-stone-900/[0.06] dark:ring-white/[0.08]">
                            <MiniBoard fen={t.fen} size={40} flipped={t.sideToPlay === 'b'} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100">
                            {t.title}
                          </span>
                          {current && <StatusChip tone="brand">роздана</StatusChip>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <ToolButton
        icon={Broadcast}
        size="md"
        onClick={onBroadcast}
        title="Открыть свою доску и сразу показать её всем ученикам"
      >
        Транслировать
      </ToolButton>

      <ToolButton
        icon={ChalkboardTeacher}
        size="md"
        onClick={onOpenMyBoard}
        title="Открыть свою доску только для себя — ученики её не увидят"
      >
        Моя доска
      </ToolButton>

      <ToolButton
        icon={doorClosed ? LockKey : LockKeyOpen}
        tone={doorClosed ? 'warning' : 'neutral'}
        size="md"
        onClick={() => onToggleDoor(!doorClosed)}
        aria-pressed={doorClosed}
        title={
          doorClosed
            ? `Вход заперт: на уроке ${admittedCount} чел., новые не войдут. Нажмите, чтобы снова впускать`
            : 'Запереть вход: те, кто уже на уроке, останутся, новые ученики войти не смогут'
        }
      >
        {doorClosed ? 'Вход закрыт' : 'Вход открыт'}
      </ToolButton>

      <ToolButton
        icon={Stop}
        tone="danger"
        size="md"
        onClick={onStop}
        // На узком экране полоса переносится, и красное «Завершить урок»
        // оказывалось вплотную к янтарному замку. Отдельная строка убирает
        // риск случайно оборвать урок вместо запирания двери.
        className="w-full sm:ml-auto sm:w-auto"
        title="Закончить урок: доски учеников закроются"
      >
        Завершить урок
      </ToolButton>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Строка состояния класса
// ───────────────────────────────────────────────────────────────

/** Что сейчас у класса и как идут дела: одна строка вместо блока «метрик». */
function LessonSummary({
  sessions,
  currentTask,
}: {
  sessions: ClassActiveSessionDto[];
  currentTask: TaskDto | null;
}) {
  const online = sessions.filter((s) => s.online).length;
  const solved = sessions.filter((s) => s.status === 'solved').length;

  if (!currentTask && sessions.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[12px] text-stone-500 dark:text-stone-400">
      {currentTask && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">Задача класса:</span>
          <span className="truncate font-semibold text-stone-700 dark:text-stone-200">
            {currentTask.title}
          </span>
        </span>
      )}
      {sessions.length > 0 && (
        <>
          <span className="tabular-nums">
            за доской <span className="font-semibold text-stone-700 dark:text-stone-200">{online}</span> из{' '}
            {sessions.length}
          </span>
          <span className="tabular-nums">
            решили <span className="font-semibold text-stone-700 dark:text-stone-200">{solved}</span>
          </span>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Живая сетка досок учеников
// ───────────────────────────────────────────────────────────────

/**
 * Личные доски всех учеников. Число колонок подбирается под ширину экрана,
 * поэтому и четыре ученика, и двадцать четыре ложатся ровными рядами.
 */
function LiveGrid({
  sessions,
  onIntrude,
}: {
  sessions: ClassActiveSessionDto[];
  onIntrude: (s: ClassActiveSessionDto) => void;
}) {
  // Порядок досок должен быть неподвижным: сервер отдаёт сессии по updatedAt,
  // и без сортировки доски прыгали бы на каждый ход ученика.
  const ordered = [...sessions].sort(
    (a, b) =>
      a.userName.localeCompare(b.userName, 'ru') || a.sessionId.localeCompare(b.sessionId),
  );

  return (
    <BoardGrid min="10.5rem">
      {ordered.map((s) => {
        const solved = s.status === 'solved';
        return (
          <BoardCard
            key={s.sessionId}
            active={solved}
            onClick={() => onIntrude(s)}
            tooltip={`Открыть доску ученика: ${s.userName}`}
            board={<MiniBoard fen={s.fen || STARTING_FEN} fluid />}
            badge={
              solved ? (
                <StatusChip tone="brand">
                  <CheckCircle size={12} weight="fill" aria-hidden />
                  решено
                </StatusChip>
              ) : undefined
            }
            title={s.userName}
            meta={
              <>
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    s.online ? 'bg-brand-500' : 'bg-stone-300 dark:bg-stone-600',
                  )}
                />
                <span className="truncate">{s.online ? s.taskTitle : 'не за доской'}</span>
                <span className="ml-auto shrink-0 tabular-nums">{s.movesPlayed}</span>
              </>
            }
          />
        );
      })}
    </BoardGrid>
  );
}
