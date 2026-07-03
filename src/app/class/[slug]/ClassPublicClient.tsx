'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { FolderIcon } from '@/components/ui/FolderIcon';
import { STARTING_FEN } from '@/lib/socket-events';
import { useClassSocket } from '@/hooks/useClassSocket';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import { RoomClient } from '@/app/room/[code]/RoomClient';
import { ClassAudioProvider } from '@/contexts/ClassAudioContext';
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
// Признак «ученик зашёл на урок» — чтобы при обновлении страницы не выкидывало с урока.
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

  // Ученик ЯВНО зашёл на урок (через кнопку «Урок»). По умолчанию — нет:
  // сначала ученик попадает на главную с домашками, а на урок входит сам.
  // Лениво восстанавливаем из sessionStorage — чтобы при F5 не выкидывало с урока
  // (если урок к этому моменту уже закончился, эффект ниже сбросит флаг обратно).
  const [lessonJoined, setLessonJoined] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(LESSON_JOINED_KEY(cls.slug)) === '1';
    } catch {
      return false;
    }
  });
  // Доска самостоятельного решения домашнего задания (вне урока).
  // Лениво восстанавливаем из sessionStorage — чтобы при обновлении страницы
  // ученик остался за задачей, а не «выпадал» на главную.
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
  // Открытая папка домашек: undefined = список папок (блоки), иначе id группы
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

  // Кнопка «назад» браузера: если ученик за доской домашки — возвращаем его на
  // главную (к списку ДЗ), а не уводим с сайта.
  useEffect(() => {
    const onPop = () => setHomeworkBoard(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Подписка на live-состояние класса — для баннера «идёт урок» и кнопки «Урок».
  const { state, connected } = useClassSocket(cls.slug);
  void connected;

  // Если урок закончился, пока ученик был «на уроке» — возвращаем его на главную.
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
      // Добавляем запись в историю браузера, чтобы «назад» вернул на список ДЗ.
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
      setCodeError('Ошибка запроса');
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
  //  - личная доска задачи (если уже раздана и есть сессия с roomCode);
  //  - иначе nothing → показываем витрину задач.
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
    activeBoard?.kind === 'task'
      ? tasks.find((t) => t.id === activeBoard.taskId)
      : undefined;

  const lobbyParticipants = state?.lobbyParticipants ?? [];
  // «На уроке» — только если ученик сам зашёл (lessonJoined) и урок идёт.
  const inLesson = !!(lessonJoined && state?.lessonActive && state.lobbyRoomCode && meId);
  // Домашки, сгруппированные по папкам (в порядке папок учителя),
  // плюс отдельная группа «Без папки» в конце.
  const homeworkGroups = useMemo(() => {
    const hw = tasks.filter((t) => t.isHomework);
    const byFolder = new Map<string, TaskDto[]>();
    const noFolder: TaskDto[] = [];
    for (const t of hw) {
      if (t.folderId) {
        const arr = byFolder.get(t.folderId) ?? [];
        arr.push(t);
        byFolder.set(t.folderId, arr);
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

  // ЖЁСТКИЙ ГЕЙТ: класс с кодом доступа закрыт целиком, пока код не введён.
  // Не показываем ни доску урока, ни лобби, ни список задач, ни аудио —
  // только экран ввода кода. Иначе ученик мог зайти на урок без подтверждения.
  if (codeNeeded) {
    return renderCodeGate();
  }

  // Старая раскладка: либо full-screen RoomClient (за доской), либо витрина задач + правый aside.
  // Лобби-аудио живёт в провайдере уровнем выше — WebRTC mesh не пересобирается
  // при переключении вида.
  const view = renderView();

  return inLesson && state?.lobbyRoomCode ? (
    <ClassAudioProvider lobbyRoomCode={state.lobbyRoomCode}>
      {view}
    </ClassAudioProvider>
  ) : (
    view
  );

  function renderCodeGate(): ReactNode {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
        <div className="card w-full max-w-md">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            🔒 Закрытый класс
          </div>
          <h1 className="font-display text-xl font-semibold leading-tight">
            {cls.name || `Класс — ${cls.ownerName}`}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Учитель: {cls.ownerName}
          </p>
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
            Чтобы войти в класс, введите код доступа, который дал учитель.
          </p>
          {!meId && (
            <p className="mt-2 text-xs text-stone-500">
              <Link href={`/login?next=/class/${cls.slug}`} className="underline">
                Войдите в аккаунт
              </Link>{' '}
              — иначе вы не сможете участвовать в уроке.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tryCode(code, true);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="например 1234"
              className="flex-1 rounded-lg border border-stone-300 bg-paper px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900"
            />
            <button type="submit" disabled={!code.trim()} className="btn-primary text-sm">
              Войти
            </button>
          </form>
          {codeError && <div className="mt-2 text-sm text-red-600">{codeError}</div>}
        </div>
      </main>
    );
  }

  function renderBoardShell(opts: {
    roomCode: string;
    name: string;
    studentTaskMode?: { humanColor: 'w' | 'b' };
    headerText: string;
    isDemo: boolean;
    onBack: () => void;
    backLabel: string;
  }): ReactNode {
    const backButton = (
      <button
        onClick={opts.onBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-stone-300/70 bg-paper px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:brightness-95 active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
      >
        <span className="text-base leading-none">🏠</span>
        {opts.backLabel.replace(/^←\s*/, '')}
      </button>
    );
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-0.5 text-[11px] font-semibold leading-tight ${
            opts.isDemo
              ? 'border-b border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
              : 'border-b border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-200'
          }`}
        >
          <span>{opts.headerText}</span>
          <span className="text-[10px] text-stone-500 dark:text-stone-400">
            {cls.name || `Класс — ${cls.ownerName}`}
          </span>
        </div>
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
            leftTopSlot={backButton}
          />
        </main>
      </div>
    );
  }

  // Карточка одной домашки (используется и в плоском списке, и внутри папки).
  function renderHwCard(t: TaskDto): ReactNode {
    const starting = startingTaskId === t.id;
    return (
      <li
        key={t.id}
        className="card flex w-[244px] flex-col items-center gap-1.5 !p-2 text-center"
      >
        <MiniBoard fen={t.fen || STARTING_FEN} size={170} flipped={t.sideToPlay === 'b'} />
        <div className="w-full truncate text-sm font-semibold" title={t.title}>
          {t.title}
        </div>
        {meId ? (
          <button
            onClick={() => startHomework(t)}
            disabled={starting}
            className="btn-primary px-4 py-1 text-xs disabled:opacity-60"
          >
            {starting ? 'Открываем…' : '▶ Решать'}
          </button>
        ) : (
          <Link href={`/login?next=/class/${cls.slug}`} className="btn-outline px-4 py-1 text-xs">
            Войти
          </Link>
        )}
      </li>
    );
  }

  function renderView(): ReactNode {
    // 1) Ученик решает домашку самостоятельно (вне урока).
    if (homeworkBoard && meId) {
      return renderBoardShell({
        roomCode: homeworkBoard.roomCode,
        name: homeworkBoard.taskTitle,
        studentTaskMode: { humanColor: homeworkBoard.humanColor },
        headerText: `🎯 Домашка: ${homeworkBoard.taskTitle}`,
        isDemo: false,
        // Через history.back() — чтобы синхронно сработала «назад» браузера
        // (popstate уберёт доску). Если запушенной записи нет — просто закрываем.
        onBack: () => {
          if (window.history.state?.classHomework) window.history.back();
          else setHomeworkBoard(null);
        },
        backLabel: '← К задачам',
      });
    }

    // 2) Ученик зашёл на урок (кнопкой «Урок»). Показываем доску урока, а если
    //    учитель ещё ничего не раздал — экран ожидания с ростером.
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
          headerText: isDemo
            ? '🔴 Учитель транслирует свою доску — следите за разбором'
            : `🎯 Задача: ${activeBoard.kind === 'task' ? activeBoard.taskTitle : ''}`,
          isDemo,
          onBack: leaveLesson,
          backLabel: '← На главную',
        });
      }
      // Урок идёт, но задача ещё не роздана / трансляции нет.
      return (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_240px]">
          <main className="flex min-h-0 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
            <div className="text-4xl">⏳</div>
            <h2 className="text-lg font-semibold">Вы на уроке</h2>
            <p className="max-w-sm text-sm text-stone-500">
              Ждём учителя: скоро откроется задача на вашей личной доске или начнётся показ.
            </p>
            <button onClick={leaveLesson} className="btn-outline text-sm">
              ← Выйти на главную
            </button>
          </main>
          {renderLobbyAside()}
        </div>
      );
    }

    // 3) Главная: домашние задания (можно решать) + кнопка «Урок».
    return (
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="rounded-xl border border-stone-200 bg-paper px-3 py-2 dark:border-stone-700 dark:bg-stone-900">
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

          {/* Идёт урок → кнопка «Урок». Ученик заходит на урок только сам,
              чтобы не «выдёргивало» с домашек на трансляцию/раздачу. */}
          {state?.lessonActive && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-700 dark:bg-emerald-900/30">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Идёт урок учителя
              </div>
              {meId ? (
                <button
                  onClick={() => setLessonJoined(true)}
                  className="btn-primary px-4 py-1 text-xs"
                >
                  Урок →
                </button>
              ) : (
                <Link href={`/login?next=/class/${cls.slug}`} className="text-xs underline">
                  Войдите, чтобы участвовать
                </Link>
              )}
            </div>
          )}

          {homeworkError && (
            <div className="rounded-lg bg-red-100 px-3 py-1.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {homeworkError}
            </div>
          )}

          {/* ── Домашние задания: папки-блоки → внутри задачи ── */}
          <h2 className="mt-1 text-base font-semibold">
            Домашние задания · {homeworkGroups.total}
          </h2>
          {homeworkGroups.total === 0 ? (
            <div className="card text-sm text-stone-500">
              Учитель пока не добавил домашних заданий. Загляните позже!
            </div>
          ) : folders.length === 0 ? (
            // Папок нет — показываем задачи сразу списком.
            <ul className="flex flex-wrap gap-2">
              {homeworkGroups.groups.flatMap((g) => g.tasks).map((t) => renderHwCard(t))}
            </ul>
          ) : openHwFolder === undefined ? (
            // Список папок-блоков.
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {homeworkGroups.groups.map((group) => (
                <li key={group.id}>
                  <button
                    onClick={() => setOpenHwFolder(group.id)}
                    className="card group flex w-full items-center gap-3.5 !p-4 pr-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500/15 dark:bg-brand-400/10 dark:text-brand-300">
                      <FolderIcon className="h-6 w-6" open={!group.name} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-tight">
                        {group.name ?? 'Без папки'}
                      </span>
                      <span className="mt-1 inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        {group.tasks.length} шт
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-stone-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // Внутри выбранной папки.
            (() => {
              const group = homeworkGroups.groups.find((g) => g.id === openHwFolder);
              return (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={() => setOpenHwFolder(undefined)}
                      className="flex items-center gap-1 rounded-full border border-stone-300/70 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Папки
                    </button>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
                      <FolderIcon className="h-4 w-4" open={!group?.name} />
                    </span>
                    <h3 className="text-sm font-semibold">{group?.name ?? 'Без папки'}</h3>
                  </div>
                  {!group || group.tasks.length === 0 ? (
                    <div className="card text-sm text-stone-500">В этой папке пока пусто.</div>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {group.tasks.map((t) => renderHwCard(t))}
                    </ul>
                  )}
                </div>
              );
            })()
          )}
        </main>
      </div>
    );
  }

  function renderLobbyAside(): ReactNode {
    if (!(inLesson && meId)) return null;
    return (
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-3 sm:px-4">
        <ClassLobbyPanel
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
                    <li key={p.userId} className="flex items-center gap-2 text-sm">
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
      </aside>
    );
  }
}
