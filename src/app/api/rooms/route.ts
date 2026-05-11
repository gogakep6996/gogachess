import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateRoomCode } from '@/lib/utils';

export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Свои комнаты + публичные чужие
  const [own, publicRooms] = await Promise.all([
    prisma.room.findMany({
      where: { ownerId: auth.sub },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.room.findMany({
      where: { isPublic: true, ownerId: { not: auth.sub } },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const map = (r: (typeof own)[number]) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isPublic: r.isPublic,
    ownerId: r.ownerId,
    ownerName: r.owner.displayName,
    createdAt: r.createdAt.toISOString(),
  });

  return NextResponse.json({ own: own.map(map), publicRooms: publicRooms.map(map) });
}

interface CreateBody {
  name?: string;
  isPublic?: boolean;
  /** "lesson" | "casual" — для приглашения друга используем "casual". */
  kind?: string;
  /** Например "blitz-5+0", "rapid-10+0". */
  timeControl?: string | null;
}

const ALLOWED_KINDS = new Set(['lesson', 'casual']);

export async function POST(request: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const kind = ALLOWED_KINDS.has(body.kind ?? '') ? (body.kind as string) : 'lesson';
  const defaultName = kind === 'casual' ? 'Партия с другом' : 'Урок шахмат';
  const name = (body.name || '').trim().slice(0, 80) || defaultName;
  // Приглашение друга — всегда приватная комната, чтобы её не было в публичном списке.
  const isPublic = kind === 'casual' ? false : Boolean(body.isPublic);
  const timeControl =
    typeof body.timeControl === 'string' && body.timeControl.trim()
      ? body.timeControl.trim().slice(0, 32)
      : null;

  let code = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.room.findUnique({ where: { code } });
    if (!exists) break;
    code = generateRoomCode();
  }

  const room = await prisma.room.create({
    data: { name, isPublic, code, ownerId: auth.sub, kind, timeControl },
  });

  return NextResponse.json({ code: room.code });
}
