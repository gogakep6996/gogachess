'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Broadcast,
  CaretLeft,
  Folder,
  FolderOpen,
  Hourglass,
  House,
  Lock,
  LockKey,
  Play,
  Target,
  Warning,
} from '@phosphor-icons/react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { useClassSocket } from '@/hooks/useClassSocket';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import {
  BoardCard,
  BoardGrid,
  EmptyState,
  FolderTile,
  ModeBar,
  SectionHead,
  SURFACE,
} from '@/components/class/ui';
import { ToolButton } from '@/components/room/ui';
import { RoomClient } from '@/app/room/[code]/RoomClient';
import { ClassAudioProvider } from '@/contexts/ClassAudioContext';
import { cn } from '@/lib/utils';
import type { TaskDto, FolderDto } from '../me/TasksLibrary';

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
  initialFolders: FolderDto[];
  isOwner: boolean;
}

const CODE_STORAGE_KEY = (slug: string) => `class-access:${slug}`;
// Где запоминаем открытую доску домашки — чтобы при F5 ученик остался за задачей.
const HOMEWORK_STORAGE_KEY = (slug: string) => `class-homework:${slug}`;
// Признак «ученик зашёл на урок» — чтобы обновление страницы не выкидывало с урока.
const LESSON_JOINED_KEY = (slug: string) => `class-lesson-joined:${slug}`;

interface HomeworkBoard {
  roomCode: string;
  humanColor: 'w' | 'b';
  taskTitle: string;
}

export function ClassPublicClient({
  meId,
  meName,
  cls,
  initialTasks,
  initialFolders,
  isOwner,
}: Props) {
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks);
  const [folders, setFolders] = useState<FolderDto[]>(initialFolders);
  const [codeNeeded, setCodeNeeded] = useState(cls.hasAccessCode && !isOwner && tasks.length === 0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // Ученик ЯВНО зашёл на урок (кнопкой «Войти на урок»). По умолчанию — нет:
  // сначала он попадает на главную с домашками. Лениво восстанавливаем из
  // sessionStorage, чтобы F5 не выкидывал с урока (если урок уже кончился,
  // эффект ниже сбросит флаг).
  const [lessonJoined, setLessonJoined] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(LESSON_JOINED_KEY(cls.slug)) === '1';
    } catch {
      return false;
    }
  });
  // Доска самостоятельного решения домашки (вне урока).
  const [homeworkBoard, setHomeworkBoard] = useState<HomeworkBoard | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(HOMEWORK_STORAGE_KEY(cls.slug));
      return raw ? (JSON.parse(raw) as HomeworkBoard) : null;
    } catch {
      return null;
    }
  });
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [homeworkError, setHomeworkError] = useState<string | null>(null);
  // Открытая папка домашек: undefined = список папок, иначе id группы
  // (id папки или '__none__' для «Без папки»).
  const [openHwFolder, setOpenHwFolder] = useState<string | undefined>(undefined);

  // Сохраняем/чистим доску домашки в sessionStorage (живёт до закрытия вкладки).
  useEffect(() => {
    try {
      if (homeworkBoard) {
        window.sessionStorage.setItem(
          HOMEWORK_STORAGE_KEY(cls.slug),
          JSON.stringify(homeworkBoard),
        );
      } else {
        window.sessionStorage.removeItem(HOMEWORK_STORAGE_KEY(cls.slug));
      }
    } catch {
      // приватный режим — не критично
    }
  }, [homeworkBoard, cls.slug]);

  // Запоминаем/сбрасываем факт входа на урок (живёт до закрытия вкладки).
  useEffect(() => {
    try {
      if (lessonJoined) {
        window.sessionStorage.setItem(LESSON_JOINED_KEY(cls.slug), '1');
      } else {
        window.sessionStorage.removeItem(LESSON_JOINED_KEY(cls.slug));
      }
    } catch {
      // приватный режим — не критично
    }
  }, [lessonJoined, cls.slug]);

  // Кнопка «назад» браузера: если ученик за доской домашки — возвращаем его к
  // списку заданий, а не уводим с сайта.
  useEffect(() => {
    const onPop = () => setHomeworkBoard(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Подписка на live-состояние класса — для баннера «идёт урок» и входа на урок.
  const { state, connected } = useClassSocket(cls.slug);
  void connected;

  // Если урок закончился, пока ученик был на нём — возвращаем его на главную.
  useEffect(() => {
    if (lessonJoined && state && !state.lessonActive) setLessonJoined(false);
  }, [lessonJoined, state]);

  async function startHomework(t: TaskDto) {
    if (!meId) return;
    setStartingTaskId(t.id);
    setHomeworkError(null);
    try {
      const savedCode =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(CODE_STORAGE_KEY(cls.slug))
          : null;
      const res = await fetch(`/api/class/${cls.slug}/homework`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(savedCode ? { 'x-class-access': savedCode } : {}),
        },
        body: JSON.stringify({ taskId: t.id }),
      });
      if (!res.ok) {
        setHomeworkError('Не удалось открыть задачу. Попробуйте ещё раз.');
        return;
      }
      const data = (await res.json()) as { roomCode: string; sideToPlay: string };
      // Добавляем запись в историю браузера, чтобы «назад» вернул к списку.
      try {
        window.history.pushState({ classHomework: cls.slug }, '');
      } catch {
        // ignore
      }
      setHomeworkBoard({
        roomCode: data.roomCode,
        humanColor: data.sideToPlay === 'b' ? 'b' : 'w',
        taskTitle: t.title,
      });
    } catch {
      setHomeworkError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setStartingTaskId(null);
    }
  }

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
      setCodeError('Не получилось проверить код. Попробуйте ещё раз.');
      return;
    }
    const data = (await res.json()) as {
      codeAccepted: boolean;
      tasks: TaskDto[];
      folders?: FolderDto[];
    };
    if (data.codeAccepted) {
      setTasks(data.tasks);
      if (data.folders) setFolders(data.folders);
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
  //  - личная доска задачи (если роздана и есть сессия);
  //  - иначе ничего → экран ожидания.
  const activeBoard = useMemo(() => {
    if (!state) return null;
    // Демо-доска видна ученикам ТОЛЬКО при включённой трансляции.
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
    activeBoard?.kind === 'task' ? tasks.find((t) => t.id === activeBoard.taskId) : undefined;

  // «На уроке» — только если ученик сам зашёл и урок идёт.
  const inLesson = !!(lessonJoined && state?.lessonActive && state.lobbyRoomCode && meId);

  // Учитель запер вход. Список допущенных фиксируется в момент запирания, так
  // что уже вошедшие спокойно переживают F5 и обрывы связи, а остальные внутрь
  // не попадут: сервер отклонит их и на входе в lobby-комнату.
  const lockedOut = !!(
    state?.joinsClosed &&
    !isOwner &&
    (!meId || !state.admittedIds.includes(meId))
  );

  // Если дверь заперли, пока ученика не было в классе, — не даём ему висеть на
  // экране урока в ожидании доски, которую он уже не получит.
  useEffect(() => {
    if (lockedOut && lessonJoined) setLessonJoined(false);
  }, [lockedOut, lessonJoined]);

  // Домашки, сгруппированные по папкам учителя, плюс «Без папки» в конце.
  const homeworkGroups = useMemo(() => {
    const hw = tasks.filter((t) => t.isHomework);
    const byFolder = new Map<string, TaskDto[]>();
    const noFolder: TaskDto[] = [];
    for (const t of hw) {
      if (t.folderIds && t.folderIds.length) {
        // Одна задача может быть сразу в нескольких папках — показываем в каждой.
        for (const fid of t.folderIds) {
          const arr = byFolder.get(fid) ?? [];
          arr.push(t);
          byFolder.set(fid, arr);
        }
      } else {
        noFolder.push(t);
      }
    }
    const groups: { id: string; name: string | null; tasks: TaskDto[] }[] = [];
    for (const f of folders) {
      const arr = byFolder.get(f.id);
      if (arr && arr.length) groups.push({ id: f.id, name: f.name, tasks: arr });
    }
    if (noFolder.length) groups.push({ id: '__none__', name: null, tasks: noFolder });
    return { total: hw.length, groups };
  }, [tasks, folders]);

  // ЖЁСТКИЙ ГЕЙТ: класс с кодом закрыт целиком, пока код не введён. Ни доски
  // урока, ни лобби, ни списка задач — иначе можно было бы попасть на урок
  // без подтверждения.
  if (codeNeeded) {
    return renderCodeGate();
  }

  const view = renderView();

  return inLesson && state?.lobbyRoomCode ? (
    <ClassAudioProvider lobbyRoomCode={state.lobbyRoomCode}>{view}</ClassAudioProvider>
  ) : (
    view
  );

  // ── Экран ввода кода ──
  function renderCodeGate(): ReactNode {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
        <div className={cn('w-full max-w-md p-6', SURFACE)}>
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300"
          >
            <Lock size={20} weight="bold" />
          </span>
          <h1 className="mt-3 text-[19px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50">
            {cls.name || `Класс — ${cls.ownerName}`}
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
            Учитель: {cls.ownerName}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-stone-600 dark:text-stone-300">
            Класс закрыт. Введите код доступа, который дал учитель.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tryCode(code, true);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="например 1234"
              aria-label="Код доступа"
              className="h-10 min-w-0 flex-1 rounded-xl border-0 bg-stone-900/[0.05] px-3 font-mono text-[14px] tracking-wider text-stone-800 outline-none ring-1 ring-inset ring-transparent transition placeholder:font-sans placeholder:tracking-normal placeholder:text-stone-400 focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800"
            />
            <ToolButton type="submit" tone="primary" size="md" disabled={!code.trim()}>
              Войти
            </ToolButton>
          </form>
          {codeError && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-red-600 dark:text-red-400">
              <Warning size={14} weight="bold" aria-hidden />
              {codeError}
            </p>
          )}
          {!meId && (
            <p className="mt-4 border-t border-stone-900/[0.07] pt-3 text-[12px] text-stone-500 dark:border-white/[0.08] dark:text-stone-400">
              <Link
                href={`/login?next=/class/${cls.slug}`}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
              >
                Войдите в аккаунт
              </Link>
              , иначе не получится участвовать в уроке.
            </p>
          )}
        </div>
      </main>
    );
  }

  // ── Каркас «ученик за доской»: полоса режима + доска на всё остальное ──
  function renderBoardShell(opts: {
    roomCode: string;
    name: string;
    studentTaskMode?: { humanColor: 'w' | 'b' };
    icon: typeof Target;
    tone: 'neutral' | 'brand' | 'amber';
    live?: boolean;
    title: string;
    subtitle: string;
    onBack: () => void;
    backLabel: string;
  }): ReactNode {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModeBar
          icon={opts.icon}
          tone={opts.tone}
          live={opts.live}
          title={opts.title}
          subtitle={opts.subtitle}
        >
          <ToolButton icon={ArrowLeft} onClick={opts.onBack}>
            {opts.backLabel}
          </ToolButton>
        </ModeBar>
        <main className="flex min-h-0 flex-1 flex-col">
          <RoomClient
            meId={meId!}
            meName={meName ?? ''}
            room={{
              code: opts.roomCode,
              name: opts.name,
              isPublic: false,
              ownerId: cls.ownerId,
              ownerName: cls.ownerName,
            }}
            embedded
            studentTaskMode={opts.studentTaskMode}
          />
        </main>
      </div>
    );
  }

  function renderHwCard(t: TaskDto): ReactNode {
    const starting = startingTaskId === t.id;
    return (
      <BoardCard
        key={t.id}
        board={<MiniBoard fen={t.fen || STARTING_FEN} fluid flipped={t.sideToPlay === 'b'} />}
        title={t.title}
        meta={<span className="truncate">{t.sideToPlay === 'b' ? 'играют чёрные' : 'играют белые'}</span>}
        footer={
          meId ? (
            <ToolButton
              icon={Play}
              tone="primary"
              block
              disabled={starting}
              onClick={() => startHomework(t)}
            >
              {starting ? 'Открываем…' : 'Решать'}
            </ToolButton>
          ) : (
            <Link
              href={`/login?next=/class/${cls.slug}`}
              className="inline-flex h-8 w-full items-center justify-center rounded-xl bg-stone-900/[0.05] text-[12px] font-semibold text-stone-700 transition-colors duration-150 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-100"
            >
              Войти, чтобы решать
            </Link>
          )
        }
      />
    );
  }

  function renderView(): ReactNode {
    // 1) Ученик решает домашку самостоятельно (вне урока).
    if (homeworkBoard && meId) {
      return renderBoardShell({
        roomCode: homeworkBoard.roomCode,
        name: homeworkBoard.taskTitle,
        studentTaskMode: { humanColor: homeworkBoard.humanColor },
        icon: Target,
        tone: 'neutral',
        title: homeworkBoard.taskTitle,
        subtitle: 'Домашнее задание',
        // Через history.back(), чтобы синхронно сработала «назад» браузера
        // (popstate уберёт доску). Если записи нет — просто закрываем.
        onBack: () => {
          if (window.history.state?.classHomework) window.history.back();
          else setHomeworkBoard(null);
        },
        backLabel: 'К заданиям',
      });
    }

    // 2) Ученик на уроке.
    if (inLesson && meId) {
      const leaveLesson = () => setLessonJoined(false);

      if (activeBoard) {
        const isDemo = activeBoard.kind === 'demo';
        const humanColor: 'w' | 'b' =
          activeBoard.kind === 'task'
            ? ((currentTaskForSide?.sideToPlay as 'w' | 'b') ?? 'w')
            : 'w';
        return renderBoardShell({
          roomCode: activeBoard.roomCode,
          name: activeBoard.kind === 'task' ? activeBoard.taskTitle : 'Показ учителя',
          studentTaskMode: activeBoard.kind === 'task' ? { humanColor } : undefined,
          icon: isDemo ? Broadcast : Target,
          tone: isDemo ? 'brand' : 'neutral',
          live: isDemo,
          title: isDemo
            ? 'Учитель показывает свою доску'
            : activeBoard.kind === 'task'
              ? activeBoard.taskTitle
              : 'Задача',
          subtitle: isDemo ? 'Следите за разбором' : 'Ваша личная доска на уроке',
          onBack: leaveLesson,
          backLabel: 'На главную',
        });
      }

      // Урок идёт, но задачи ещё нет и трансляция не включена.
      return (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <main className="flex min-h-0 items-center justify-center overflow-y-auto p-4">
            <EmptyState
              icon={Hourglass}
              title="Вы на уроке"
              hint="Ждём учителя: сейчас откроется задача на вашей личной доске или начнётся показ."
            >
              <ToolButton icon={ArrowLeft} onClick={leaveLesson}>
                Выйти на главную
              </ToolButton>
            </EmptyState>
          </main>
          <aside className="flex min-h-0 flex-col px-3 pb-3 pt-3 sm:px-5 lg:pl-0">
            <ClassLobbyPanel
              meId={meId}
              isTeacher={isOwner}
              className="min-h-[26rem] flex-1"
            />
          </aside>
        </div>
      );
    }

    // 3) Главная класса: домашние задания и вход на урок.
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50">
              {cls.name || `Класс — ${cls.ownerName}`}
            </h1>
            <p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">
              Учитель: {cls.ownerName}
            </p>
          </div>
          {isOwner && (
            <Link
              href="/class/me"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-stone-900/[0.05] px-2.5 text-[12px] font-semibold text-stone-600 transition-colors duration-150 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]"
            >
              Управлять классом
            </Link>
          )}
        </div>

        {/* Урок идёт → вход. Ученик заходит сам, чтобы его не выдёргивало
            с домашки на чужую трансляцию. */}
        {state?.lessonActive && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-2.5',
              lockedOut
                ? 'bg-amber-50/90 ring-amber-600/20 dark:bg-amber-950/40 dark:ring-amber-400/20'
                : 'bg-brand-50/90 ring-brand-600/15 dark:bg-brand-950/50 dark:ring-brand-400/20',
              SURFACE,
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white',
                  lockedOut ? 'bg-amber-600' : 'bg-brand-600',
                )}
              >
                {lockedOut ? (
                  <LockKey size={16} weight="bold" />
                ) : (
                  <Broadcast size={16} weight="bold" />
                )}
              </span>
              <span className="min-w-0 leading-tight">
                <span
                  className={cn(
                    'block text-[13px] font-semibold',
                    lockedOut
                      ? 'text-amber-900 dark:text-amber-100'
                      : 'text-brand-800 dark:text-brand-100',
                  )}
                >
                  Идёт урок
                </span>
                <span
                  className={cn(
                    'block truncate text-[11px]',
                    lockedOut
                      ? 'text-amber-800/70 dark:text-amber-200/70'
                      : 'text-brand-700/70 dark:text-brand-200/70',
                  )}
                >
                  {lockedOut ? 'Учитель закрыл вход' : 'Учитель уже в классе'}
                </span>
              </span>
            </div>
            {!meId ? (
              <Link
                href={`/login?next=/class/${cls.slug}`}
                className="text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-200"
              >
                Войдите, чтобы участвовать
              </Link>
            ) : lockedOut ? (
              <span className="text-[12px] font-medium text-amber-800 dark:text-amber-200">
                Попросите учителя открыть вход
              </span>
            ) : (
              <ToolButton
                icon={Play}
                tone="primary"
                size="md"
                onClick={() => setLessonJoined(true)}
              >
                Войти на урок
              </ToolButton>
            )}
          </div>
        )}

        {homeworkError && (
          <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            <Warning size={14} weight="bold" aria-hidden />
            {homeworkError}
          </p>
        )}

        {renderHomework()}
      </main>
    );
  }

  function renderHomework(): ReactNode {
    if (homeworkGroups.total === 0) {
      return (
        <EmptyState
          icon={House}
          title="Домашних заданий пока нет"
          hint="Учитель ещё не выложил задачи. Загляните позже."
        />
      );
    }

    // Папок нет — показываем задачи сразу.
    if (folders.length === 0) {
      return (
        <div className="flex flex-col gap-2.5">
          <SectionHead title="Домашние задания" count={homeworkGroups.total} />
          <BoardGrid min="12rem">
            {homeworkGroups.groups.flatMap((g) => g.tasks).map((t) => renderHwCard(t))}
          </BoardGrid>
        </div>
      );
    }

    // Список папок.
    if (openHwFolder === undefined) {
      return (
        <div className="flex flex-col gap-2.5">
          <SectionHead
            title="Домашние задания"
            count={homeworkGroups.total}
            hint="Выберите папку, чтобы увидеть задачи"
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {homeworkGroups.groups.map((group) => (
              <FolderTile
                key={group.id}
                icon={group.name ? Folder : FolderOpen}
                name={group.name ?? 'Без папки'}
                count={group.tasks.length}
                onClick={() => setOpenHwFolder(group.id)}
              />
            ))}
          </div>
        </div>
      );
    }

    // Внутри папки.
    const group = homeworkGroups.groups.find((g) => g.id === openHwFolder);
    return (
      <div className="flex flex-col gap-2.5">
        <SectionHead title={group?.name ?? 'Без папки'} count={group?.tasks.length ?? 0}>
          <ToolButton icon={CaretLeft} onClick={() => setOpenHwFolder(undefined)}>
            Все папки
          </ToolButton>
        </SectionHead>
        {!group || group.tasks.length === 0 ? (
          <EmptyState icon={FolderOpen} title="В этой папке пусто" />
        ) : (
          <BoardGrid min="12rem">{group.tasks.map((t) => renderHwCard(t))}</BoardGrid>
        )}
      </div>
    );
  }
}
