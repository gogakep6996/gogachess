import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CreateRoomForm } from './CreateRoomForm';

export default async function RoomsPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login');

  const own = await prisma.room.findMany({
    where: { ownerId: auth.sub, kind: 'lesson' },
    include: { owner: { select: { displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Создать комнату</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Откройте свою комнату для урока и пригласите учеников по ссылке.
            </p>
          </div>
        </header>
        <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <section className="space-y-4">
            <CreateRoomForm />
            <div className="card">
              <h3 className="font-semibold">Подсказка</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Комнаты закрытые — попасть в них можно только по прямой ссылке.
                После создания скопируйте ссылку на странице комнаты и отправьте
                ученикам.
              </p>
            </div>
          </section>

          <section className="space-y-8">
            <RoomList title="Мои комнаты" rooms={own.map(map)} empty="Вы ещё не создали ни одной комнаты" />
          </section>
        </div>
      </main>
    </>
  );
}

function map(r: { id: string; code: string; name: string; ownerId: string; createdAt: Date; owner: { displayName: string } }) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    ownerName: r.owner.displayName,
    createdAt: r.createdAt.toISOString(),
  };
}

interface RoomItem {
  id: string;
  code: string;
  name: string;
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
