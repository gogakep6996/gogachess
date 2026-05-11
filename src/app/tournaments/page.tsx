import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { timeControlLabel } from '@/lib/socket-events';
import { CreateTournamentForm } from './CreateTournamentForm';
import { JoinButton } from './JoinButton';

function statusLabel(s: string): { label: string; tone: string } {
  if (s === 'running') return { label: 'идёт', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
  if (s === 'finished') return { label: 'завершён', tone: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' };
  return { label: 'запланирован', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
}

export default async function TournamentsPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/tournaments');

  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
    include: {
      owner: { select: { displayName: true } },
      _count: { select: { players: true, matches: true } },
      players: { where: { userId: auth.sub }, select: { id: true } },
    },
    take: 50,
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Турниры</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Арена со свободным подбором: жмёте «Участвовать» — вас сразу сводят с другим
              свободным игроком. Очки начисляются стандартно (1 / 0.5 / 0).
            </p>
          </div>
        </header>

        <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <CreateTournamentForm />

          <section>
            <h2 className="mb-3 text-lg font-semibold">Все турниры</h2>
            {tournaments.length === 0 ? (
              <div className="card text-sm text-stone-500">Пока нет турниров. Создайте первый.</div>
            ) : (
              <ul className="grid gap-3">
                {tournaments.map((t) => {
                  const s = statusLabel(t.status);
                  const joined = t.players.length > 0;
                  return (
                    <li key={t.id} className="card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/tournaments/${t.id}`} className="text-base font-semibold hover:text-brand-600">
                              {t.name}
                            </Link>
                            <span className={`badge ${s.tone}`}>{s.label}</span>
                          </div>
                          <p className="mt-1 text-xs text-stone-500">
                            {timeControlLabel(t.timeControl)} · {t.durationMin} мин ·
                            старт {new Date(t.startsAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}{' '}
                            · участников {t._count.players} · партий {t._count.matches}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">Организатор: {t.owner.displayName}</p>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/tournaments/${t.id}`} className="btn-outline text-xs">
                            Открыть
                          </Link>
                          {t.status !== 'finished' && (
                            <JoinButton id={t.id} initiallyJoined={joined} />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
