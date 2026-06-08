import { notFound, redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Пользователи — админка',
};

/**
 * Список email'ов администраторов (через запятую) из переменной окружения.
 * Только эти аккаунты видят страницу — остальным отдаём 404, чтобы сам факт
 * существования админки не светился.
 */
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminUsersPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/admin/users');

  const me = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { email: true },
  });

  const admins = getAdminEmails();
  const myEmail = me?.email?.toLowerCase() ?? '';
  // Если список админов не задан или текущий пользователь в него не входит — 404.
  if (admins.length === 0 || !myEmail || !admins.includes(myEmail)) {
    notFound();
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      phone: true,
      displayName: true,
      emailVerifiedAt: true,
      createdAt: true,
      _count: {
        select: {
          ownedRooms: true,
          ownedTournaments: true,
          taskSessions: true,
        },
      },
    },
  });

  const verifiedCount = users.filter((u) => u.emailVerifiedAt).length;

  return (
    <div className="flex min-h-dvh flex-col bg-surface dark:bg-surface-dark">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100">
            Пользователи
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Всего: <span className="font-medium">{users.length}</span> · с
            подтверждённым email: <span className="font-medium">{verifiedCount}</span>
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-200/80 bg-white/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100/70 text-stone-500 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-400">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Имя</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Телефон</th>
                <th className="px-3 py-2 font-medium">Email подтверждён</th>
                <th className="px-3 py-2 font-medium">Регистрация</th>
                <th className="px-3 py-2 text-right font-medium">Комнаты</th>
                <th className="px-3 py-2 text-right font-medium">Турниры</th>
                <th className="px-3 py-2 text-right font-medium">Задачи</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  className="border-b border-stone-200/70 text-stone-800 last:border-0 dark:border-stone-800/70 dark:text-stone-100"
                >
                  <td className="px-3 py-2 text-stone-400 dark:text-stone-500">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">{u.displayName}</td>
                  <td className="px-3 py-2">{u.email ?? '—'}</td>
                  <td className="px-3 py-2">{u.phone ?? '—'}</td>
                  <td className="px-3 py-2">
                    {u.emailVerifiedAt ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {fmtDate(u.emailVerifiedAt)}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">нет</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-stone-500 dark:text-stone-400">
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">{u._count.ownedRooms}</td>
                  <td className="px-3 py-2 text-right">{u._count.ownedTournaments}</td>
                  <td className="px-3 py-2 text-right">{u._count.taskSessions}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-stone-500 dark:text-stone-400"
                  >
                    Пока нет зарегистрированных пользователей.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
