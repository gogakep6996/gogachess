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
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ClassMeClient
          meId={auth.sub}
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
      </main>
    </>
  );
}
