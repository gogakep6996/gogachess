'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Books,
  Broadcast,
  ChalkboardTeacher,
  Check,
  Eye,
  House,
  Link as LinkIcon,
  PresentationChart,
  Stop,
} from '@phosphor-icons/react';
import { useClassSocket } from '@/hooks/useClassSocket';
import { TasksLibrary, type TaskDto, type FolderDto } from './TasksLibrary';
import { HomeworkManager } from './HomeworkManager';
import { LessonDashboard, type IntrudeRequest } from './LessonDashboard';
import { ClassLobbyPanel } from '@/components/class/ClassLobbyPanel';
import { LobbyFloatingChat } from '@/components/class/FloatingChat';
import { ModeBar } from '@/components/class/ui';
import { Segmented, ToolButton } from '@/components/room/ui';
import { RoomClient } from '@/app/room/[code]/RoomClient';
import { ClassAudioProvider } from '@/contexts/ClassAudioContext';
import { cn } from '@/lib/utils';
import type { ClassDto } from './ClassSettings';
import { ClassAccessCode } from './ClassAccessCode';

interface Props {
  meId: string;
  meName: string;
  initialClass: ClassDto;
  initialTasks: TaskDto[];
  initialFolders: FolderDto[];
  initialLibraryFolders: FolderDto[];
}

type Tab = 'lesson' | 'homework' | 'tasks';

export function ClassMeClient({
  meId,
  meName,
  initialClass,
  initialTasks,
  initialFolders,
  initialLibraryFolders,
}: Props) {
  const [cls] = useState<ClassDto>(initialClass);
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks);
  const [folders, setFolders] = useState<FolderDto[]>(initialFolders);
  const [libraryFolders, setLibraryFolders] = useState<FolderDto[]>(initialLibraryFolders);
  const [tab, setTab] = useState<Tab>('lesson');
  // Вторжение учителя в личную доску ученика. Когда задано — рендерим
  // full-screen RoomClient (учитель = owner student-board комнаты, видит тот же
  // UI, что и в «Моей доске», и может править позицию).
  const [intrudeRoom, setIntrudeRoom] = useState<IntrudeRequest | null>(null);

  // Сокет класса поднимаем здесь, чтобы дашборд и провайдер аудио делили
  // одно и то же состояние.
  const classSocket = useClassSocket(cls.slug);
  const { state, stopDemo, toggleBroadcast } = classSocket;

  const broadcasting = !!state?.demoBroadcast;
  const inLesson = !!(state?.lessonActive && state.lobbyRoomCode);
  // За доской (вторжение или своя доска) главная область занята целиком —
  // чат в этих режимах живёт плавающей кнопкой. На дашборде он в правой
  // колонке, поэтому пузырь там не нужен и ничего не перекрывает.
  const atBoard = !!intrudeRoom || !!state?.demoRoomCode;

  const view = renderView();

  return inLesson && state?.lobbyRoomCode ? (
    <ClassAudioProvider lobbyRoomCode={state.lobbyRoomCode}>
      {view}
      {atBoard && <LobbyFloatingChat meId={meId} isTeacher />}
    </ClassAudioProvider>
  ) : (
    view
  );

  function renderView(): ReactNode {
    // ── Доска конкретного ученика ──
    if (intrudeRoom) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <ModeBar
            icon={Eye}
            tone="amber"
            title={<>Доска ученика: {intrudeRoom.studentName}</>}
            subtitle="Всё, что вы делаете на этой доске, ученик видит сразу"
          >
            <ToolButton icon={ArrowLeft} onClick={() => setIntrudeRoom(null)}>
              К классу
            </ToolButton>
          </ModeBar>
          <main className="flex min-h-0 flex-1 flex-col">
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
            />
          </main>
        </div>
      );
    }

    // ── Своя доска: приватно или в эфир ──
    if (state?.demoRoomCode) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <ModeBar
            icon={broadcasting ? Broadcast : PresentationChart}
            tone={broadcasting ? 'brand' : 'neutral'}
            live={broadcasting}
            title={broadcasting ? 'Идёт трансляция' : 'Моя доска'}
            subtitle={
              broadcasting
                ? 'Ученики видят эту доску вместо своих задач'
                : 'Видна только вам — подготовьте позицию и включите эфир'
            }
          >
            {broadcasting ? (
              <ToolButton icon={Stop} onClick={() => toggleBroadcast(false)}>
                Остановить эфир
              </ToolButton>
            ) : (
              <ToolButton icon={Broadcast} tone="primary" onClick={() => toggleBroadcast(true)}>
                В эфир
              </ToolButton>
            )}
            <ToolButton icon={ArrowLeft} onClick={stopDemo}>
              К классу
            </ToolButton>
          </ModeBar>
          <main className="flex min-h-0 flex-1 flex-col">
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
            />
          </main>
        </div>
      );
    }

    // ── Командный центр: разделы слева, участники и чат справа ──
    return (
      <div
        className={cn(
          'grid min-h-0 flex-1',
          inLesson ? 'lg:grid-cols-[minmax(0,1fr)_17rem]' : 'lg:grid-cols-1',
        )}
      >
        <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-5">
          <ClassTopBar
            cls={cls}
            tab={tab}
            onTabChange={setTab}
            homeworkCount={tasks.filter((t) => t.isHomework).length}
            libraryCount={tasks.length}
          />

          {tab === 'lesson' ? (
            <LessonDashboard
              cls={cls}
              tasks={tasks}
              socket={classSocket}
              onIntrude={setIntrudeRoom}
            />
          ) : tab === 'homework' ? (
            <HomeworkManager
              tasks={tasks}
              folders={folders}
              onTasksChange={setTasks}
              onFoldersChange={setFolders}
            />
          ) : (
            <TasksLibrary
              cls={cls}
              tasks={tasks}
              libraryFolders={libraryFolders}
              onTasksChange={setTasks}
              onLibraryFoldersChange={setLibraryFolders}
            />
          )}
        </main>

        {inLesson && (
          <aside className="flex min-h-0 flex-col px-3 pb-3 pt-3 sm:px-5 lg:pl-0">
            <ClassLobbyPanel meId={meId} isTeacher className="min-h-[26rem] flex-1" />
          </aside>
        )}
      </div>
    );
  }
}

// ───────────────────────────────────────────────────────────────
// Шапка класса
// ───────────────────────────────────────────────────────────────

/**
 * Одна строка вместо трёх разнородных плашек: чей класс, как в него зайти и
 * какой раздел открыт. Ссылка и код доступа — соседи, потому что учитель
 * диктует их ученикам вместе.
 */
function ClassTopBar({
  cls,
  tab,
  onTabChange,
  homeworkCount,
  libraryCount,
}: {
  cls: ClassDto;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  homeworkCount: number;
  libraryCount: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="truncate text-[17px] font-semibold tracking-tight text-stone-900 dark:text-stone-50">
          {cls.name || `Класс — ${cls.ownerName}`}
        </h1>
        <ClassLinkButton slug={cls.slug} />
        <ClassAccessCode initialCode={cls.accessCode} />
      </div>

      <Segmented
        ariaLabel="Разделы класса"
        className="w-full sm:w-auto"
        value={tab}
        onChange={onTabChange}
        options={[
          { id: 'lesson', label: 'Урок', icon: ChalkboardTeacher },
          { id: 'homework', label: `Домашние · ${homeworkCount}`, icon: House },
          { id: 'tasks', label: `Библиотека · ${libraryCount}`, icon: Books },
        ]}
      />
    </div>
  );
}

/** Ссылка-приглашение в класс: сама кнопка и есть «скопировать». */
function ClassLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Скопировать ссылку на класс"
      onClick={() => {
        if (typeof window === 'undefined') return;
        navigator.clipboard
          ?.writeText(`${window.location.origin}/class/${slug}`)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => undefined);
      }}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
        copied
          ? 'bg-brand-600 text-white'
          : 'bg-stone-900/[0.05] text-stone-600 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]',
      )}
    >
      {copied ? (
        <Check size={14} weight="bold" aria-hidden />
      ) : (
        <LinkIcon size={14} weight="bold" aria-hidden />
      )}
      {copied ? 'Скопировано' : `/class/${slug}`}
    </button>
  );
}
