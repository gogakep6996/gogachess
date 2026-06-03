import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUser, requireVerifiedUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_DIFF = new Set(['easy', 'medium', 'hard']);
const VALID_GOAL = new Set(['mate', 'win-material', 'custom']);

export async function POST(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Если класса ещё нет — мы его сейчас создадим. Это требует подтверждённого
  // email (тот же гейт, что и на /api/class/me и /class/me).
  const existing = await prisma.class.findUnique({ where: { ownerId: auth.sub } });
  if (!existing) {
    const guard = await requireVerifiedUser();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error, needsVerification: true },
        { status: guard.status },
      );
    }
  }

  const cls = await ensureClassForUser(auth.sub);
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    fen?: string;
    sideToPlay?: 'w' | 'b';
    difficulty?: string;
    category?: string;
    goal?: string;
    engineLevel?: number;
    isPublished?: boolean;
  };

  const title = (body.title ?? '').trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const fen = (body.fen ?? '').trim();
  try {
    new Chess(fen);
  } catch {
    return NextResponse.json({ error: 'invalid FEN' }, { status: 400 });
  }

  const sideToPlay = body.sideToPlay === 'b' ? 'b' : 'w';
  const difficulty = body.difficulty && VALID_DIFF.has(body.difficulty) ? body.difficulty : 'medium';
  const goal = body.goal && VALID_GOAL.has(body.goal) ? body.goal : 'mate';
  const engineLevel = Math.max(0, Math.min(20, Number(body.engineLevel ?? 10)));
  const category = (body.category ?? '').trim().slice(0, 40) || null;
  const description = (body.description ?? '').trim().slice(0, 1000) || null;
  const isPublished = body.isPublished !== false;

  const maxPos = await prisma.task.aggregate({
    where: { classId: cls.id },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      classId: cls.id,
      title,
      description,
      fen,
      sideToPlay,
      difficulty,
      category,
      goal,
      engineLevel,
      isPublished,
      position: (maxPos._max.position ?? 0) + 1,
    },
  });

  return NextResponse.json({ task });
}
