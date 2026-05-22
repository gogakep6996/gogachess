import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TournamentClient } from './TournamentClient';

export default async function TournamentPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getCurrentUser();
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { where: { userId: auth?.sub ?? '' }, select: { id: true } },
    },
  });
  if (!t) return notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <TournamentClient
          id={t.id}
          name={t.name}
          meId={auth?.sub ?? null}
          initiallyJoined={t.players.length > 0}
        />
      </main>
    </>
  );
}
