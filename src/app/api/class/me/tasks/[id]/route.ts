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
  const removingHomework = body.isHomework === false;
  if (body.isHomework !== undefined) data.isHomework = Boolean(body.isHomework);
  if (body.position !== undefined) data.position = Number(body.position);

  // Членство задачи в папках ДЗ (многие-ко-многим). Способы задать новый набор:
  //   • folderIds: string[] — авторитетный полный список папок;
  //   • addFolderId / removeFolderId — точечно добавить/убрать одну папку.
  // Все id проверяем на принадлежность классу. Если задачу убирают из ДЗ
  // (isHomework=false) — очищаем все папки.
  let folderIdsToSet: string[] | undefined;
  if (Array.isArray(body.folderIds)) {
    folderIdsToSet = Array.from(
      new Set(body.folderIds.filter((x): x is string => typeof x === 'string')),
    );
  } else if (typeof body.addFolderId === 'string' || typeof body.removeFolderId === 'string') {
    const current = await prisma.homeworkFolderTask.findMany({
      where: { taskId: id },
      select: { folderId: true },
    });
    const set = new Set(current.map((l) => l.folderId));
    if (typeof body.addFolderId === 'string') set.add(body.addFolderId);
    if (typeof body.removeFolderId === 'string') set.delete(body.removeFolderId);
    folderIdsToSet = Array.from(set);
  }
  if (removingHomework) folderIdsToSet = [];

  if (folderIdsToSet && folderIdsToSet.length > 0) {
    const valid = await prisma.homeworkFolder.findMany({
      where: { id: { in: folderIdsToSet }, classId: result.task.classId },
      select: { id: true },
    });
    if (valid.length !== folderIdsToSet.length) {
      return NextResponse.json({ error: 'folder not found' }, { status: 400 });
    }
  }

  // Членство в папках «Моей библиотеки» (LibraryFolderTask) — отдельный набор,
  // не связанный с папками ДЗ. Способы те же: libraryFolderIds / add / remove.
  let libFolderIdsToSet: string[] | undefined;
  if (Array.isArray(body.libraryFolderIds)) {
    libFolderIdsToSet = Array.from(
      new Set(body.libraryFolderIds.filter((x): x is string => typeof x === 'string')),
    );
  } else if (
    typeof body.addLibraryFolderId === 'string' ||
    typeof body.removeLibraryFolderId === 'string'
  ) {
    const current = await prisma.libraryFolderTask.findMany({
      where: { taskId: id },
      select: { folderId: true },
    });
    const set = new Set(current.map((l) => l.folderId));
    if (typeof body.addLibraryFolderId === 'string') set.add(body.addLibraryFolderId);
    if (typeof body.removeLibraryFolderId === 'string') set.delete(body.removeLibraryFolderId);
    libFolderIdsToSet = Array.from(set);
  }

  if (libFolderIdsToSet && libFolderIdsToSet.length > 0) {
    const valid = await prisma.libraryFolder.findMany({
      where: { id: { in: libFolderIdsToSet }, classId: result.task.classId },
      select: { id: true },
    });
    if (valid.length !== libFolderIdsToSet.length) {
      return NextResponse.json({ error: 'library folder not found' }, { status: 400 });
    }
  }

  const updated = await prisma.task.update({ where: { id }, data });

  if (folderIdsToSet !== undefined) {
    await prisma.homeworkFolderTask.deleteMany({ where: { taskId: id } });
    if (folderIdsToSet.length > 0) {
      await prisma.homeworkFolderTask.createMany({
        data: folderIdsToSet.map((folderId) => ({ taskId: id, folderId })),
      });
    }
  }

  if (libFolderIdsToSet !== undefined) {
    await prisma.libraryFolderTask.deleteMany({ where: { taskId: id } });
    if (libFolderIdsToSet.length > 0) {
      await prisma.libraryFolderTask.createMany({
        data: libFolderIdsToSet.map((folderId) => ({ taskId: id, folderId })),
      });
    }
  }

  const [links, libLinks] = await Promise.all([
    prisma.homeworkFolderTask.findMany({ where: { taskId: id }, select: { folderId: true } }),
    prisma.libraryFolderTask.findMany({ where: { taskId: id }, select: { folderId: true } }),
  ]);
  return NextResponse.json({
    task: {
      ...updated,
      folderIds: links.map((l) => l.folderId),
      libraryFolderIds: libLinks.map((l) => l.folderId),
    },
  });
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
