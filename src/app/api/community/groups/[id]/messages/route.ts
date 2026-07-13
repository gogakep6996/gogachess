import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireMember(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
}

/** GET /api/community/groups/[id]/messages — последние сообщения чата (участникам). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const member = await requireMember(id, auth.sub);
  if (!member) return NextResponse.json({ error: 'Чат доступен участникам группы' }, { status: 403 });

  const messages = await prisma.groupMessage.findMany({
    where: { groupId: id },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.displayName,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/** POST — отправить сообщение в чат группы (участникам). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const member = await requireMember(id, auth.sub);
  if (!member) return NextResponse.json({ error: 'Чат доступен участникам группы' }, { status: 403 });

  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const content = (body.content || '').trim().slice(0, 1000);
  if (!content) return NextResponse.json({ error: 'Пустое сообщение' }, { status: 400 });

  const msg = await prisma.groupMessage.create({
    data: { groupId: id, userId: auth.sub, content },
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      userId: auth.sub,
      name: auth.name,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
