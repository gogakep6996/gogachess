import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { timeControlLabel } from '@/lib/socket-events';
import { TournamentClient } from './TournamentClient';

export default async function TournamentPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getCurrentUser();
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      owner: { select: { displayName: true } },
      players: { where: { userId: auth?.sub ?? '' }, select: { id: true } },
    },
  });
  if (!t) return notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">{t.name}</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {timeControlLabel(t.timeControl)} · {t.durationMin} мин · старт{' '}
              {new Date(t.startsAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}{' '}
              · организатор {t.owner.displayName}
            </p>
          </div>
        </header>

        <TournamentClient
          id={t.id}
          meId={auth?.sub ?? null}
          initiallyJoined={t.players.length > 0}
        />
      </main>
    </>
  );
}
