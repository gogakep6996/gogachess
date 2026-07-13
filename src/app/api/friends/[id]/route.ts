import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Body {
  action?: 'accept' | 'reject';
}

/** PATCH /api/friends/[id] — принять или отклонить входящую заявку. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (body.action !== 'accept' && body.action !== 'reject') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const f = await prisma.friendship.findUnique({ where: { id } });
  // Отвечать на заявку может только адресат, и только пока она pending.
  if (!f || f.addresseeId !== auth.sub || f.status !== 'pending') {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  await prisma.friendship.update({
    where: { id },
    data: { status: body.action === 'accept' ? 'accepted' : 'rejected' },
  });

  if (body.action === 'accept') {
    try {
      await prisma.notification.create({
        data: {
          userId: f.requesterId,
          title: 'Заявка принята',
          body: `${auth.name} принял(а) вашу заявку в друзья.`,
        },
      });
    } catch (err) {
      console.error('[friends/accept] notification failed:', err);
    }
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/friends/[id] — удалить из друзей или отменить свою заявку. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const f = await prisma.friendship.findUnique({ where: { id } });
  if (!f || (f.requesterId !== auth.sub && f.addresseeId !== auth.sub)) {
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
