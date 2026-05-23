import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ClassPublicClient } from './ClassPublicClient';

export const dynamic = 'force-dynamic';

export default async function ClassPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cls = await prisma.class.findUnique({
    where: { slug },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (!cls) return notFound();

  const auth = await getCurrentUser();
  const isOwner = auth?.sub === cls.ownerId;
  const hasAccessCode = Boolean(cls.accessCode);

  // Если код доступа задан, задачи прячем до его ввода.
  const tasks =
    hasAccessCode && !isOwner
      ? []
      : await prisma.task.findMany({
          where: { classId: cls.id, isPublished: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ClassPublicClient
          meId={auth?.sub ?? null}
          cls={{
            id: cls.id,
            slug: cls.slug,
            name: cls.name,
            ownerId: cls.ownerId,
            ownerName: cls.owner.displayName,
            hasAccessCode,
          }}
          initialTasks={tasks}
          isOwner={isOwner}
        />
      </main>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cls = await prisma.class.findUnique({
    where: { slug },
    include: { owner: { select: { displayName: true } } },
  });
  if (!cls) return { title: 'Класс не найден' };
  return { title: cls.name || `Класс — ${cls.owner.displayName}` };
}
