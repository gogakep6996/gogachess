import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ClassSearch } from './ClassSearch';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Классы учителей',
};

export default async function ClassIndexPage() {
  const auth = await getCurrentUser();
  const classes = await prisma.class.findMany({
    where: { isPublic: true },
    take: 60,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { displayName: true } },
      _count: { select: { tasks: true } },
    },
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Классы учителей</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Зайдите к своему учителю — там его задачи и групповые уроки. Или найдите
              нового тренера в каталоге.
            </p>
          </div>
          {auth ? (
            <Link href="/class/me" className="btn-primary text-sm">
              Мой класс →
            </Link>
          ) : (
            <Link href="/login?next=/class" className="btn-primary text-sm">
              Войти, чтобы создать класс
            </Link>
          )}
        </header>

        <ClassSearch
          initialClasses={classes.map((c) => ({
            slug: c.slug,
            name: c.name,
            ownerName: c.owner.displayName,
            tasksCount: c._count.tasks,
            hasAccessCode: Boolean(c.accessCode),
          }))}
        />
      </main>
    </>
  );
}
