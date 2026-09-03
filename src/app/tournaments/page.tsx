import { Suspense } from 'react';
import Link from 'next/link';
import {
  CaretRight,
  Clock,
  Lock,
  PuzzlePiece,
  Trophy,
  Users,
} from '@phosphor-icons/react/dist/ssr';

import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { timeControlLabel } from '@/lib/socket-events';

import { ArenaTimer } from './ArenaTimer';
import { CreateArenaForm } from './CreateArenaForm';

/** Список меняется каждую минуту, кэшировать его нельзя. */
export const dynamic = 'force-dynamic';

const SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

interface ArenaRow {
  id: string;
  name: string;
  timeControl: string;
  durationMin: number;
  status: string;
  startsAt: Date;
  hasCode: boolean;
  /** Партии начинаются не со стандартной позиции. */
  customStart: boolean;
  players: number;
  ownerName: string;
}

function toRow(a: {
  id: string;
  name: string;
  timeControl: string;
  durationMin: number;
  status: string;
  startsAt: Date;
  accessCode: string | null;
  startFen: string | null;
  owner: { displayName: string };
  _count: { players: number };
}): ArenaRow {
  return {
    id: a.id,
    name: a.name,
    timeControl: a.timeControl,
    durationMin: a.durationMin,
    status: a.status,
    startsAt: a.startsAt,
    hasCode: !!a.accessCode,
    customStart: a.startFen !== null,
    players: a._count.players,
    ownerName: a.owner.displayName,
  };
}

export default async function TournamentsPage() {
  const user = await getCurrentUser();

  const select = {
    id: true,
    name: true,
    timeControl: true,
    durationMin: true,
    status: true,
    startsAt: true,
    accessCode: true,
    startFen: true,
    owner: { select: { displayName: true } },
    _count: { select: { players: true } },
  } as const;

  const [running, scheduled, finished] = await Promise.all([
    prisma.arena.findMany({
      where: { status: 'running' },
      orderBy: { startsAt: 'asc' },
      select,
    }),
    prisma.arena.findMany({
      where: { status: 'scheduled' },
      orderBy: { startsAt: 'asc' },
      select,
    }),
    prisma.arena.findMany({
      where: { status: 'finished' },
      orderBy: { finishedAt: 'desc' },
      take: 12,
      select,
    }),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Турниры
            </h1>
            <p className="mt-1.5 max-w-[58ch] text-pretty text-[14px] leading-relaxed text-stone-600 dark:text-stone-400">
              Арена: пока идёт отведённое время, соперник находится сам, а за
              победы подряд дают двойные очки.
            </p>
          </div>
          {user ? (
            // Форма читает позицию из адреса (?fen=), поэтому нужна граница Suspense.
            <Suspense fallback={null}>
              <CreateArenaForm />
            </Suspense>
          ) : (
            <Link href="/login?next=/tournaments" className="btn-primary px-4 py-2 text-sm">
              Войти, чтобы играть
            </Link>
          )}
        </div>

        <Section title="Идут сейчас" rows={running.map(toRow)} empty="Сейчас турниров нет." live />
        <Section
          title="Скоро"
          rows={scheduled.map(toRow)}
          empty="Ничего не назначено. Создайте турнир, и он появится здесь."
        />
        <Section title="Завершённые" rows={finished.map(toRow)} empty="Пока ни одного." />
      </main>
    </>
  );
}

function Section({
  title,
  rows,
  empty,
  live = false,
}: {
  title: string;
  rows: ArenaRow[];
  empty: string;
  live?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[15px] font-semibold text-stone-800 dark:text-stone-100">
        {title}
        {rows.length > 0 && (
          <span className="text-[13px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
            {rows.length}
          </span>
        )}
      </h2>

      {rows.length === 0 ? (
        <p className={`${SURFACE} px-4 py-6 text-center text-[13px] text-stone-500 dark:text-stone-400`}>
          {empty}
        </p>
      ) : (
        <ul className={`${SURFACE} divide-y divide-stone-900/[0.05] overflow-hidden dark:divide-white/[0.05]`}>
          {rows.map((a) => (
            <li key={a.id}>
              <Link
                href={`/tournaments/${a.id}`}
                className="group flex items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:hover:bg-brand-900/40"
              >
                <span
                  aria-hidden
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    live
                      ? 'bg-brand-600 text-white'
                      : 'bg-stone-900/[0.06] text-stone-500 dark:bg-white/[0.08] dark:text-stone-300'
                  }`}
                >
                  <Trophy size={17} weight="bold" />
                  {live && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-red-500 ring-2 ring-white dark:ring-stone-900" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-stone-800 dark:text-stone-100">
                      {a.name}
                    </span>
                    {a.hasCode && (
                      <span title="Нужен код доступа" className="shrink-0 leading-none">
                        <Lock
                          size={12}
                          weight="fill"
                          aria-label="нужен код доступа"
                          className="text-stone-400 dark:text-stone-500"
                        />
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-stone-500 dark:text-stone-400">
                    <span>{timeControlLabel(a.timeControl)}</span>
                    {a.status === 'scheduled' && (
                      <span>
                        {a.startsAt.toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                        })}
                        {', '}
                        {a.startsAt.toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock size={12} weight="bold" aria-hidden />
                      <ArenaTimer
                        status={a.status}
                        startsAt={a.startsAt.toISOString()}
                        endsAt={new Date(
                          a.startsAt.getTime() + a.durationMin * 60_000,
                        ).toISOString()}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Users size={12} weight="bold" aria-hidden />
                      {a.players}
                    </span>
                    {a.customStart && (
                      <span className="inline-flex items-center gap-1">
                        <PuzzlePiece size={12} weight="bold" aria-hidden />
                        своя позиция
                      </span>
                    )}
                    <span className="truncate">создал {a.ownerName}</span>
                  </span>
                </span>

                <CaretRight
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-stone-600"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
