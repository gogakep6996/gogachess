import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';
import { ClassMeClient } from './ClassMeClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Мой класс',
};

export default async function ClassMePage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/class/me');

  const cls = await ensureClassForUser(auth.sub);
  const tasks = await prisma.task.findMany({
    where: { classId: cls.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    // Контейнер как в /room/[code]: фиксированная высота на десктопе, чтобы
    // вложенный RoomClient (когда учитель открывает «Мою доску»/трансляцию)
    // мог занять весь вьюпорт без скролла страницы. Сам ClassMeClient уже
    // включает прокручиваемую область для обычного дашборда.
    <div className="flex min-h-dvh flex-col overscroll-none bg-surface dark:bg-surface-dark lg:h-dvh lg:overflow-hidden">
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
      />
    </div>
  );
}
