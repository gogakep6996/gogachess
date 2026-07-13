import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser, requireVerifiedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/groups — список групп сообщества с фильтрами.
 * ?q= поиск по названию, ?country=, ?city= — точнее сузить.
 * Для залогиненного отмечаем membership/заявку, чтобы в списке показать статус.
 */
export async function GET(req: Request) {
  const auth = await getCurrentUser();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const country = (url.searchParams.get('country') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();

  const groups = await prisma.group.findMany({
    // Обычный contains (без mode: 'insensitive') — он не поддерживается на SQLite,
    // а локальная разработка идёт именно на нём. На проде (PostgreSQL) поиск
    // получается регистрозависимым — для названий школ это приемлемо.
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(country ? { country: { contains: country } } : {}),
      ...(city ? { city: { contains: city } } : {}),
    },
    include: {
      owner: { select: { id: true, displayName: true } },
      _count: { select: { members: true } },
      members: auth
        ? { where: { userId: auth.sub }, select: { role: true } }
        : { where: { userId: '' }, select: { role: true } },
      requests: auth
        ? { where: { userId: auth.sub, status: 'pending' }, select: { id: true } }
        : { where: { userId: '' }, select: { id: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      country: g.country,
      city: g.city,
      ownerId: g.owner.id,
      ownerName: g.owner.displayName,
      members: g._count.members,
      createdAt: g.createdAt.toISOString(),
      myRole: g.members[0]?.role ?? null,
      requestPending: g.requests.length > 0,
    })),
  });
}

interface CreateBody {
  name?: string;
  country?: string;
  city?: string;
  description?: string;
}

/** POST /api/community/groups — создать группу (создатель становится админом). */
export async function POST(request: Request) {
  // Создание группы видно всем в общем списке → требуем подтверждённый email
  // (как для классов и турниров), чтобы не плодили спам-группы.
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

  const name = (body.name || '').trim().slice(0, 80);
  const country = (body.country || '').trim().slice(0, 56);
  const city = (body.city || '').trim().slice(0, 56);
  const description = (body.description || '').trim().slice(0, 2000) || null;

  if (name.length < 2) {
    return NextResponse.json({ error: 'Название минимум 2 символа' }, { status: 400 });
  }
  if (!country || !city) {
    return NextResponse.json({ error: 'Укажите страну и город' }, { status: 400 });
  }

  // Не даём одному человеку наплодить группы: максимум 5 своих групп.
  const ownedCount = await prisma.group.count({ where: { ownerId: guard.userId } });
  if (ownedCount >= 5) {
    return NextResponse.json(
      { error: 'Можно создать не больше 5 групп' },
      { status: 400 },
    );
  }

  const group = await prisma.group.create({
    data: {
      name,
      country,
      city,
      description,
      ownerId: guard.userId,
      inviteCode: randomBytes(9).toString('base64url'),
      members: { create: { userId: guard.userId, role: 'admin' } },
    },
  });

  return NextResponse.json({ id: group.id });
}
