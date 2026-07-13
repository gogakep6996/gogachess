import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Body {
  /** Инвайт-код из прямой ссылки — вступление сразу, без заявки. */
  inviteCode?: string;
}

/**
 * POST /api/community/groups/[id]/join
 *  - с inviteCode → мгновенное вступление (учитель дал прямую ссылку);
 *  - без него → заявка на вступление, которую одобряет админ.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true, inviteCode: true },
  });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: auth.sub } },
  });
  if (existing) return NextResponse.json({ ok: true, joined: true });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // тело опционально
  }

  // Прямая ссылка от учителя — вступаем сразу.
  if (body.inviteCode) {
    if (body.inviteCode !== group.inviteCode) {
      return NextResponse.json({ error: 'Ссылка-приглашение недействительна' }, { status: 403 });
    }
    await prisma.groupMember.create({ data: { groupId: id, userId: auth.sub } });
    // Если висела заявка — считаем её одобренной.
    await prisma.groupJoinRequest.updateMany({
      where: { groupId: id, userId: auth.sub, status: 'pending' },
      data: { status: 'approved' },
    });
    return NextResponse.json({ ok: true, joined: true });
  }

  // Обычный путь — заявка. Повторная подача перезаписывает отклонённую.
  await prisma.groupJoinRequest.upsert({
    where: { groupId_userId: { groupId: id, userId: auth.sub } },
    create: { groupId: id, userId: auth.sub, status: 'pending' },
    update: { status: 'pending' },
  });

  // Уведомляем админа группы (некритично, поэтому в try).
  try {
    await prisma.notification.create({
      data: {
        userId: group.ownerId,
        title: 'Новая заявка в группу',
        body: `${auth.name} хочет вступить в «${group.name}». Откройте группу, чтобы одобрить.`,
      },
    });
  } catch (err) {
    console.error('[community/join] notification failed:', err);
  }

  return NextResponse.json({ ok: true, joined: false, pending: true });
}
