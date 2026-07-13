import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages — список диалогов: по одному последнему сообщению на
 * собеседника + число непрочитанных от него.
 */
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  // Берём последние 500 сообщений с моим участием и сворачиваем в диалоги.
  // Для наших объёмов это проще и надёжнее сырого SQL с DISTINCT ON.
  const recent = await prisma.directMessage.findMany({
    where: { OR: [{ fromId: auth.sub }, { toId: auth.sub }] },
    include: {
      from: { select: { id: true, displayName: true } },
      to: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const dialogs = new Map<
    string,
    { peerId: string; peerName: string; lastText: string; lastAt: string; lastFromMe: boolean; unread: number }
  >();
  for (const m of recent) {
    const peer = m.fromId === auth.sub ? m.to : m.from;
    const existing = dialogs.get(peer.id);
    if (!existing) {
      dialogs.set(peer.id, {
        peerId: peer.id,
        peerName: peer.displayName,
        lastText: m.content,
        lastAt: m.createdAt.toISOString(),
        lastFromMe: m.fromId === auth.sub,
        unread: m.toId === auth.sub && !m.readAt ? 1 : 0,
      });
    } else if (m.toId === auth.sub && !m.readAt) {
      existing.unread += 1;
    }
  }

  return NextResponse.json({ dialogs: Array.from(dialogs.values()) });
}

interface SendBody {
  toId?: string;
  content?: string;
}

/** POST /api/messages — отправить личное сообщение. */
export async function POST(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const toId = (body.toId || '').trim();
  const content = (body.content || '').trim().slice(0, 2000);
  if (!toId || !content) return NextResponse.json({ error: 'Пустое сообщение' }, { status: 400 });
  if (toId === auth.sub) return NextResponse.json({ error: 'Нельзя писать самому себе' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: toId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

  const msg = await prisma.directMessage.create({
    data: { fromId: auth.sub, toId, content },
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      fromId: auth.sub,
      toId,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
