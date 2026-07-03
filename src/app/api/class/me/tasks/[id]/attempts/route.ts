import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { MoveHistoryEntry } from '@/lib/socket-events';

export const dynamic = 'force-dynamic';

/**
 * GET /api/class/me/tasks/[id]/attempts?userId=<id>
 * Список попыток ученика по домашнему заданию — с полной историей ходов,
 * чтобы учитель мог перелистать каждую партию. Доступно только владельцу класса.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id },
    include: { class: { select: { ownerId: true } } },
  });
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (task.class.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });

  const attempts = await prisma.taskAttempt.findMany({
    where: { taskId: id, userId },
    orderBy: { startedAt: 'asc' },
  });

  const rows = attempts.map((a, i) => {
    let moves: MoveHistoryEntry[] = [];
    if (a.moves) {
      try {
        moves = JSON.parse(a.moves) as MoveHistoryEntry[];
      } catch {
        moves = [];
      }
    }
    return {
      id: a.id,
      index: i + 1,
      status: a.status,
      movesPlayed: a.movesPlayed,
      startedAt: a.startedAt.toISOString(),
      solvedAt: a.solvedAt ? a.solvedAt.toISOString() : null,
      startFen: a.startFen ?? task.fen,
      moves,
    };
  });

  return NextResponse.json({
    task: { id: task.id, title: task.title, sideToPlay: task.sideToPlay },
    student: { id: userId, name: student?.displayName ?? 'Ученик' },
    attempts: rows,
  });
}
