import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { GroupClient } from './GroupClient';

export const dynamic = 'force-dynamic';

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exists = await prisma.group.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return notFound();

  const auth = await getCurrentUser();
  return (
    <>
      <Header />
      <main className="w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6">
        <GroupClient groupId={id} meId={auth?.sub ?? null} />
      </main>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const g = await prisma.group.findUnique({ where: { id }, select: { name: true } });
  return { title: g ? `${g.name} — сообщество gogachess` : 'Группа не найдена' };
}
