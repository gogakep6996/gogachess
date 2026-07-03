import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/class/me/tasks/[id]/report — отчёт по домашнему заданию.
 * Для каждого ученика: сколько было попыток, сколько из них решены,
 * когда решена в последний раз и когда была последняя попытка.
 * Доступно только владельцу класса.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { class: { select: { ownerId: true } } },
  });
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (task.class.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const attempts = await prisma.taskAttempt.findMany({
    where: { taskId: id },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { startedAt: 'asc' },
  });

  // Сворачиваем по ученику.
  const byUser = new Map<
    string,
    {
      userId: string;
      name: string;
      attempts: number;
      solves: number;
      lastAttemptAt: string | null;
      lastSolvedAt: string | null;
    }
  >();

  for (const a of attempts) {
    const key = a.userId;
    const row =
      byUser.get(key) ??
      {
        userId: a.userId,
        name: a.user.displayName,
        attempts: 0,
        solves: 0,
        lastAttemptAt: null as string | null,
        lastSolvedAt: null as string | null,
      };
    row.attempts += 1;
    row.lastAttemptAt = a.startedAt.toISOString();
    if (a.status === 'solved' && a.solvedAt) {
      row.solves += 1;
      row.lastSolvedAt = a.solvedAt.toISOString();
    }
    byUser.set(key, row);
  }

  // Сначала те, кто решил, затем по числу попыток.
  const rows = Array.from(byUser.values()).sort((x, y) => {
    if (y.solves !== x.solves) return y.solves - x.solves;
    return y.attempts - x.attempts;
  });

  const totals = {
    students: rows.length,
    attempts: attempts.length,
    solvedStudents: rows.filter((r) => r.solves > 0).length,
  };

  return NextResponse.json({
    task: { id: task.id, title: task.title },
    totals,
    rows,
  });
}
