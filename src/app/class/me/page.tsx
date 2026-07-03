import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';
import { ClassMeClient } from './ClassMeClient';
import { ClassMeLockedView } from './ClassMeLockedView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Мой класс',
};

export default async function ClassMePage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/class/me');

  // Если класс ещё не создан — требуем подтверждённый email перед созданием.
  // У существующих учителей класс уже есть, поэтому проверка их не затрагивает.
  const existing = await prisma.class.findUnique({
    where: { ownerId: auth.sub },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (!existing) {
    const me = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!me?.emailVerifiedAt) {
      return (
        <div className="flex min-h-dvh flex-col bg-surface dark:bg-surface-dark">
          <Header />
          <ClassMeLockedView email={me?.email ?? null} />
        </div>
      );
    }
  }

  const cls = existing ?? (await ensureClassForUser(auth.sub));
  const [tasks, folders] = await Promise.all([
    prisma.task.findMany({
      where: { classId: cls.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.homeworkFolder.findMany({
      where: { classId: cls.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return (
    // Контейнер как в /room/[code]: фиксированная высота на десктопе, чтобы
    // вложенный RoomClient (когда учитель открывает «Мою доску»/трансляцию)
    // мог занять весь вьюпорт без скролла страницы. Сам ClassMeClient уже
    // включает прокручиваемую область для обычного дашборда.
    <div className="flex min-h-dvh flex-col overscroll-none bg-surface dark:bg-surface-dark lg:landscape:h-dvh lg:landscape:overflow-hidden">
      <div className="shrink-0">
        <Header />
      </div>
      <ClassMeClient
        meId={auth.sub}
        meName={auth.name}
        initialClass={{
          id: cls.id,
          slug: cls.slug,
          name: cls.name,
          accessCode: cls.accessCode,
          isPublic: cls.isPublic,
          ownerName: cls.owner.displayName,
        }}
        initialTasks={tasks}
        initialFolders={folders}
      />
    </div>
  );
}
