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
    // Контейнер как в /class/me: фиксированная высота на десктопе. Это нужно,
    // чтобы при активной задаче ученика вложенный RoomClient мог занять весь
    // вьюпорт без скролла. ClassPublicClient сам решает, рендерить ли
    // полноэкранную доску или обычный лендинг класса с прокруткой.
    <div className="flex min-h-dvh flex-col overscroll-none bg-surface dark:bg-surface-dark lg:h-dvh lg:overflow-hidden">
      <div className="shrink-0">
        <Header />
      </div>
      <ClassPublicClient
        meId={auth?.sub ?? null}
        meName={auth?.name ?? null}
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
    </div>
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
