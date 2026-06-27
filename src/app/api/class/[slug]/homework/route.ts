import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { STARTING_FEN } from '@/lib/socket-events';

export const dynamic = 'force-dynamic';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function uniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    const hit = await prisma.room.findUnique({ where: { code }, select: { id: true } });
    if (!hit) return code;
  }
  // Крайне маловероятно — добавляем суффикс времени.
  return `H${Date.now().toString(36).toUpperCase().slice(-7)}`;
}

/**
 * Ученик начинает решать домашнее задание самостоятельно (без урока).
 * Создаёт свежую личную доску (Room kind='student-board') в позиции задачи и
 * привязывает к ней TaskSession. Возвращает код комнаты — клиент открывает её
 * через RoomClient с движком-соперником.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cls = await prisma.class.findUnique({ where: { slug } });
  if (!cls) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isOwner = auth.sub === cls.ownerId;

  // Проверка кода доступа (как в GET /api/class/[slug]).
  if (cls.accessCode && !isOwner) {
    const url = new URL(req.url);
    const provided =
      url.searchParams.get('code') || req.headers.get('x-class-access') || '';
    if (provided !== cls.accessCode) {
      return NextResponse.json({ error: 'access denied' }, { status: 403 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as { taskId?: string };
  const taskId = body.taskId;
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.classId !== cls.id) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 });
  }
  if (!task.isHomework) {
    return NextResponse.json({ error: 'task is not homework' }, { status: 400 });
  }

  const fen = task.fen || STARTING_FEN;

  // Свежий старт: убираем прошлую доску этой задачи у ученика (чтобы решать
  // с начала), затем создаём новую и переиспользуем/создаём TaskSession.
  const existing = await prisma.taskSession.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: auth.sub } },
  });
  if (existing?.roomId) {
    await prisma.room.deleteMany({ where: { id: existing.roomId } });
  }

  const code = await uniqueRoomCode();
  const room = await prisma.room.create({
    data: {
      code,
      name: `Домашка · ${task.title}`.slice(0, 80),
      isPublic: false,
      ownerId: cls.ownerId,
      kind: 'student-board',
      fen,
    },
  });

  if (existing) {
    await prisma.taskSession.update({
      where: { id: existing.id },
      data: { roomId: room.id, fen, status: 'active', movesPlayed: 0, solvedAt: null },
    });
  } else {
    await prisma.taskSession.create({
      data: { taskId: task.id, userId: auth.sub, roomId: room.id, fen, status: 'active' },
    });
  }

  return NextResponse.json({ roomCode: code, sideToPlay: task.sideToPlay });
}
