import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Body {
  requestId?: string;
  action?: 'approve' | 'reject';
}

/** POST /api/community/groups/[id]/requests — одобрить/отклонить заявку (админ). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { id },
    select: { ownerId: true, name: true },
  });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });
  if (group.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Заявки обрабатывает только админ группы' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!body.requestId || (body.action !== 'approve' && body.action !== 'reject')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const request = await prisma.groupJoinRequest.findUnique({ where: { id: body.requestId } });
  if (!request || request.groupId !== id || request.status !== 'pending') {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  if (body.action === 'approve') {
    await prisma.$transaction([
      prisma.groupJoinRequest.update({
        where: { id: request.id },
        data: { status: 'approved' },
      }),
      prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: id, userId: request.userId } },
        create: { groupId: id, userId: request.userId },
        update: {},
      }),
    ]);
  } else {
    await prisma.groupJoinRequest.update({
      where: { id: request.id },
      data: { status: 'rejected' },
    });
  }

  // Уведомление заявителю (некритично).
  try {
    await prisma.notification.create({
      data: {
        userId: request.userId,
        title: body.action === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена',
        body:
          body.action === 'approve'
            ? `Вас приняли в группу «${group.name}».`
            : `Заявку в группу «${group.name}» отклонили.`,
      },
    });
  } catch (err) {
    console.error('[community/requests] notification failed:', err);
  }

  return NextResponse.json({ ok: true });
}
