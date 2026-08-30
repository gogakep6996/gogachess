import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ClassSearch } from './ClassSearch';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Групповые уроки',
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
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="max-w-xl">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50">
              Групповые уроки
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600 dark:text-stone-400">
              Зайдите к своему учителю: там его задачи и живые уроки. Или найдите нового
              тренера в каталоге.
            </p>
          </div>
          <Link
            href={auth ? '/class/me' : '/login?next=/class'}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(28,83,59,0.35)] transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-1"
          >
            {auth ? 'Мой класс' : 'Войти, чтобы создать класс'}
          </Link>
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
