import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, requireVerifiedUser } from '@/lib/auth';
import { TIME_CONTROLS } from '@/lib/socket-events';

export async function GET() {
  const auth = await getCurrentUser();
  const list = await prisma.tournament.findMany({
    orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
    include: {
      owner: { select: { displayName: true } },
      _count: { select: { players: true, matches: true } },
      players: { where: auth ? { userId: auth.sub } : { userId: '' }, select: { id: true } },
    },
    take: 50,
  });
  return NextResponse.json({
    tournaments: list.map((t) => ({
      id: t.id,
      name: t.name,
      timeControl: t.timeControl,
      durationMin: t.durationMin,
      startsAt: t.startsAt.toISOString(),
      status: t.status,
      ownerName: t.owner.displayName,
      players: t._count.players,
      matches: t._count.matches,
      joined: t.players.length > 0,
    })),
  });
}

interface CreateBody {
  name: string;
  timeControl: string;
  durationMin: number;
  startsAt: string;
}

export async function POST(request: Request) {
  // Создание турнира — действие с реальным impact на других пользователей
  // (рассылка в общую ленту), поэтому требуем подтверждённый email.
  const guard = await requireVerifiedUser();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, needsVerification: true },
      { status: guard.status },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const name = (body.name || '').trim().slice(0, 80) || 'Турнир';
  const timeControl = body.timeControl;
  if (!TIME_CONTROLS.find((t) => t.id === timeControl)) {
    return NextResponse.json({ error: 'Неверный контроль времени' }, { status: 400 });
  }
  const durationMin = Math.max(5, Math.min(360, Math.floor(Number(body.durationMin) || 30)));
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Неверная дата старта' }, { status: 400 });
  }

  const t = await prisma.tournament.create({
    data: { name, timeControl, durationMin, startsAt, ownerId: guard.userId },
  });
  return NextResponse.json({ id: t.id });
}
