import { notFound } from 'next/navigation';

import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

import { ArenaClient } from './ArenaClient';

export const dynamic = 'force-dynamic';

export default async function ArenaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Существование турнира проверяем на сервере: иначе клиент успеет
  // подключиться к сокету и показать пустой экран вместо честной 404.
  const arena = await prisma.arena.findUnique({ where: { id }, select: { id: true } });
  if (!arena) notFound();

  const user = await getCurrentUser();

  return (
    <>
      <Header />
      <ArenaClient arenaId={id} meId={user?.sub ?? null} />
    </>
  );
}
