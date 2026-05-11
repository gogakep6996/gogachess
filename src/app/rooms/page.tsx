import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CreateRoomForm } from './CreateRoomForm';

export default async function RoomsPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login');

  const [own, publicRooms] = await Promise.all([
    prisma.room.findMany({
      where: { ownerId: auth.sub, kind: 'lesson' },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.room.findMany({
      where: { isPublic: true, ownerId: { not: auth.sub }, kind: 'lesson' },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Создать комнату</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Откройте свою комнату для урока или присоединитесь к публичной.
            </p>
          </div>
        </header>
        <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <section className="space-y-4">
            <CreateRoomForm />
            <div className="card">
              <h3 className="font-semibold">Подсказка</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                После создания комнаты скопируйте ссылку на странице комнаты и отправьте ученикам.
                В <span className="font-medium text-brand-600">закрытую</span> попадут только по
                прямой ссылке, а <span className="font-medium text-brand-600">публичная</span>{' '}
                появится в общем списке.
              </p>
            </div>
          </section>

          <section className="space-y-8">
            <RoomList title="Мои комнаты" rooms={own.map(map)} empty="Вы ещё не создали ни одной комнаты" />
            <RoomList
              title="Публичные комнаты"
              rooms={publicRooms.map(map)}
              empty="Пока нет открытых комнат от других учителей"
            />
          </section>
        </div>
      </main>
    </>
  );
}

function map(r: { id: string; code: string; name: string; isPublic: boolean; ownerId: string; createdAt: Date; owner: { displayName: string } }) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    isPublic: r.isPublic,
    ownerName: r.owner.displayName,
    createdAt: r.createdAt.toISOString(),
  };
}

interface RoomItem {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  ownerName: string;
  createdAt: string;
}

function RoomList({ title, rooms, empty }: { title: string; rooms: RoomItem[]; empty: string }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rooms.length === 0 ? (
        <div className="card text-sm text-stone-500">{empty}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link
                href={`/room/${r.code}`}
                className="card block transition hover:-translate-y-0.5 hover:shadow-glow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{r.name}</h3>
                  <span
                    className={
                      r.isPublic
                        ? 'badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'badge bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                    }
                  >
                    {r.isPublic ? 'публичная' : 'закрытая'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  Учитель: {r.ownerName} · код {r.code}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
