import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateRoomCode } from '@/lib/utils';

export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Публичных комнат больше нет — отдаём только собственные.
  const own = await prisma.room.findMany({
    where: { ownerId: auth.sub },
    include: { owner: { select: { displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const map = (r: (typeof own)[number]) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isPublic: r.isPublic,
    ownerId: r.ownerId,
    ownerName: r.owner.displayName,
    createdAt: r.createdAt.toISOString(),
  });

  return NextResponse.json({ own: own.map(map), publicRooms: [] });
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
  // Публичные комнаты отключены: все создаваемые комнаты закрытые,
  // доступны только по прямой ссылке.
  const isPublic = false;
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
