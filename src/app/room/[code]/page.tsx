import { redirect, notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RoomClient } from './RoomClient';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  const auth = await getCurrentUser();
  if (!auth) redirect(`/login?next=/room/${code}`);

  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (!room) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-surface dark:bg-surface-dark">
      <div className="shrink-0">
        <Header />
      </div>
      <RoomClient
        meId={auth.sub}
        meName={auth.name}
        room={{
          code: room.code,
          name: room.name,
          isPublic: room.isPublic,
          ownerId: room.ownerId,
          ownerName: room.owner.displayName,
        }}
      />
    </div>
  );
}
