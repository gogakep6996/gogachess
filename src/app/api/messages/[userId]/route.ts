import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/[userId] — переписка с конкретным пользователем.
 * Побочный эффект: входящие от него помечаются прочитанными.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const peer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });
  if (!peer) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { fromId: auth.sub, toId: userId },
        { fromId: userId, toId: auth.sub },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });

  await prisma.directMessage.updateMany({
    where: { fromId: userId, toId: auth.sub, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    peer: { id: peer.id, name: peer.displayName },
    messages: messages.map((m) => ({
      id: m.id,
      fromId: m.fromId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
