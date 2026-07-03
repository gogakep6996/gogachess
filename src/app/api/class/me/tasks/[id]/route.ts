import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_DIFF = new Set(['easy', 'medium', 'hard']);
const VALID_GOAL = new Set(['mate', 'win-material', 'custom']);

async function authorize(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { class: true },
  });
  if (!task) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  if (task.class.ownerId !== userId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { task };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const result = await authorize(id, auth.sub);
  if ('error' in result) return result.error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const t = body.title.trim().slice(0, 120);
    if (t) data.title = t;
  }
  if (body.description !== undefined) {
    const d = (body.description as string | null)?.trim() ?? '';
    data.description = d ? d.slice(0, 1000) : null;
  }
  if (typeof body.fen === 'string') {
    try {
      new Chess(body.fen);
    } catch {
      return NextResponse.json({ error: 'invalid FEN' }, { status: 400 });
    }
    data.fen = body.fen;
  }
  if (body.sideToPlay === 'w' || body.sideToPlay === 'b') data.sideToPlay = body.sideToPlay;
  if (typeof body.difficulty === 'string' && VALID_DIFF.has(body.difficulty)) {
    data.difficulty = body.difficulty;
  }
  if (typeof body.goal === 'string' && VALID_GOAL.has(body.goal)) data.goal = body.goal;
  if (body.category !== undefined) {
    const c = (body.category as string | null)?.trim() ?? '';
    data.category = c ? c.slice(0, 40) : null;
  }
  if (body.engineLevel !== undefined) {
    data.engineLevel = Math.max(0, Math.min(20, Number(body.engineLevel)));
  }
  if (body.isPublished !== undefined) data.isPublished = Boolean(body.isPublished);
  if (body.isHomework !== undefined) data.isHomework = Boolean(body.isHomework);
  if (body.position !== undefined) data.position = Number(body.position);

  // Назначение папки домашнего задания. null = убрать из папки («Без папки»).
  // Строку принимаем только если папка принадлежит тому же классу.
  if (body.folderId !== undefined) {
    if (body.folderId === null) {
      data.folderId = null;
    } else if (typeof body.folderId === 'string') {
      const folder = await prisma.homeworkFolder.findUnique({
        where: { id: body.folderId },
        select: { classId: true },
      });
      if (!folder || folder.classId !== result.task.classId) {
        return NextResponse.json({ error: 'folder not found' }, { status: 400 });
      }
      data.folderId = body.folderId;
    }
  }

  const updated = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ task: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const result = await authorize(id, auth.sub);
  if ('error' in result) return result.error;

  const sessions = await prisma.taskSession.findMany({
    where: { taskId: id },
    select: { roomId: true },
  });
  const roomIds = sessions.map((s) => s.roomId).filter((x): x is string => Boolean(x));
  if (roomIds.length > 0) {
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  }
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
