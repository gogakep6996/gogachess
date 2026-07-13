import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/** POST /api/community/groups/[id]/leave — покинуть группу. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
  if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });

  // Владелец не «выходит» — он может только удалить группу целиком,
  // иначе группа останется без админа.
  if (group.ownerId === auth.sub) {
    return NextResponse.json(
      { error: 'Админ не может покинуть свою группу. Можно удалить группу.' },
      { status: 400 },
    );
  }

  await prisma.groupMember.deleteMany({ where: { groupId: id, userId: auth.sub } });
  // Чистим и заявку, чтобы можно было вступить заново.
  await prisma.groupJoinRequest.deleteMany({ where: { groupId: id, userId: auth.sub } });

  return NextResponse.json({ ok: true });
}
