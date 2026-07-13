import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/groups/[id] — страница группы.
 * Участникам — полный вид (чат подгружается отдельно), остальным — витрина
 * (название, описание, число участников) + статус своей заявки.
 * Админу дополнительно: pending-заявки и инвайт-ссылка.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, displayName: true } },
      members: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      tournaments: {
        orderBy: { startsAt: 'desc' },
        take: 50,
        include: { _count: { select: { players: true } } },
      },
    },
  });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });

  const me = auth ? group.members.find((m) => m.userId === auth.sub) : undefined;
  const isAdmin = Boolean(me && (me.role === 'admin' || group.ownerId === auth?.sub));

  // Статус моей заявки (для кнопки «Подать заявку» / «Заявка отправлена»).
  let myRequestStatus: string | null = null;
  if (auth && !me) {
    const req = await prisma.groupJoinRequest.findUnique({
      where: { groupId_userId: { groupId: id, userId: auth.sub } },
      select: { status: true },
    });
    myRequestStatus = req?.status ?? null;
  }

  // Заявки видит только админ.
  const requests = isAdmin
    ? await prisma.groupJoinRequest.findMany({
        where: { groupId: id, status: 'pending' },
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      country: group.country,
      city: group.city,
      description: group.description,
      ownerId: group.owner.id,
      ownerName: group.owner.displayName,
      createdAt: group.createdAt.toISOString(),
      membersCount: group.members.length,
    },
    myRole: me?.role ?? null,
    myRequestStatus,
    inviteCode: isAdmin ? group.inviteCode : null,
    members: group.members.map((m) => ({
      userId: m.user.id,
      name: m.user.displayName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
    requests: requests.map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.displayName,
      createdAt: r.createdAt.toISOString(),
    })),
    tournaments: group.tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      timeControl: t.timeControl,
      durationMin: t.durationMin,
      startsAt: t.startsAt.toISOString(),
      status: t.status,
      players: t._count.players,
    })),
  });
}

interface PatchBody {
  name?: string;
  country?: string;
  city?: string;
  description?: string | null;
}

/** PATCH — редактирование группы (только админ). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });
  if (group.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Редактировать может только админ группы' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const data: Record<string, string | null> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 80);
    if (name.length < 2) return NextResponse.json({ error: 'Название минимум 2 символа' }, { status: 400 });
    data.name = name;
  }
  if (typeof body.country === 'string') data.country = body.country.trim().slice(0, 56);
  if (typeof body.city === 'string') data.city = body.city.trim().slice(0, 56);
  if (body.description !== undefined) {
    data.description = (body.description || '').trim().slice(0, 2000) || null;
  }

  await prisma.group.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

/** DELETE — удалить группу (только админ-владелец). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });
  if (group.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Удалить может только админ группы' }, { status: 403 });
  }

  await prisma.group.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
