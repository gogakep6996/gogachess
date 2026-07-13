import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/friends — мои друзья + входящие и исходящие заявки.
 */
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const all = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: auth.sub }, { addresseeId: auth.sub }],
      status: { in: ['pending', 'accepted'] },
    },
    include: {
      requester: { select: { id: true, displayName: true } },
      addressee: { select: { id: true, displayName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const friends: { id: string; userId: string; name: string }[] = [];
  const incoming: { id: string; userId: string; name: string; createdAt: string }[] = [];
  const outgoing: { id: string; userId: string; name: string; createdAt: string }[] = [];

  for (const f of all) {
    const peer = f.requesterId === auth.sub ? f.addressee : f.requester;
    if (f.status === 'accepted') {
      friends.push({ id: f.id, userId: peer.id, name: peer.displayName });
    } else if (f.addresseeId === auth.sub) {
      incoming.push({ id: f.id, userId: peer.id, name: peer.displayName, createdAt: f.createdAt.toISOString() });
    } else {
      outgoing.push({ id: f.id, userId: peer.id, name: peer.displayName, createdAt: f.createdAt.toISOString() });
    }
  }

  return NextResponse.json({ friends, incoming, outgoing });
}

interface Body {
  userId?: string;
}

/** POST /api/friends — отправить заявку в друзья. */
export async function POST(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const userId = (body.userId || '').trim();
  if (!userId) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (userId === auth.sub) {
    return NextResponse.json({ error: 'Нельзя добавить в друзья себя' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });
  if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

  // Пара могла существовать в любом направлении.
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: auth.sub, addresseeId: userId },
        { requesterId: userId, addresseeId: auth.sub },
      ],
    },
  });

  if (existing) {
    if (existing.status === 'accepted') {
      return NextResponse.json({ ok: true, already: 'friends' });
    }
    if (existing.status === 'pending') {
      // Встречная заявка от него? Принимаем сразу — оба хотят дружить.
      if (existing.requesterId === userId) {
        await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'accepted' } });
        return NextResponse.json({ ok: true, already: 'accepted-mutual' });
      }
      return NextResponse.json({ ok: true, already: 'pending' });
    }
    // Была отклонена — пробуем ещё раз от текущего пользователя.
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: 'pending', requesterId: auth.sub, addresseeId: userId },
    });
  } else {
    await prisma.friendship.create({
      data: { requesterId: auth.sub, addresseeId: userId },
    });
  }

  // Уведомление получателю (некритично).
  try {
    await prisma.notification.create({
      data: {
        userId,
        title: 'Заявка в друзья',
        body: `${auth.name} хочет добавить вас в друзья. Открыть: раздел «Друзья» в меню аккаунта.`,
      },
    });
  } catch (err) {
    console.error('[friends] notification failed:', err);
  }

  return NextResponse.json({ ok: true });
}
