import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUser, requireVerifiedUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_DIFF = new Set(['easy', 'medium', 'hard']);
const VALID_GOAL = new Set(['mate', 'win-material', 'custom']);

// Список задач текущего учителя — используется блоком «Библиотека» в редакторе
// доски (комната/класс), чтобы быстро подгрузить ранее сохранённую позицию.
// По умолчанию отдаём только опубликованные; ?all=1 вернёт и черновики.
export async function GET(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cls = await prisma.class.findUnique({ where: { ownerId: auth.sub } });
  if (!cls) return NextResponse.json({ tasks: [] });

  const all = new URL(req.url).searchParams.get('all') === '1';
  const rows = await prisma.task.findMany({
    where: { classId: cls.id, ...(all ? {} : { isPublished: true }) },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      folderLinks: { select: { folderId: true } },
      libraryFolderLinks: { select: { folderId: true } },
    },
  });
  const tasks = rows.map(({ folderLinks, libraryFolderLinks, ...t }) => ({
    ...t,
    folderIds: folderLinks.map((l) => l.folderId),
    libraryFolderIds: libraryFolderLinks.map((l) => l.folderId),
  }));

  return NextResponse.json({ tasks });
}

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
    isHomework?: boolean;
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
  const isHomework = body.isHomework === true;

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
      isHomework,
      position: (maxPos._max.position ?? 0) + 1,
    },
  });

  // Новая задача ещё не разложена по папкам.
  return NextResponse.json({
    task: { ...task, folderIds: [] as string[], libraryFolderIds: [] as string[] },
  });
}
