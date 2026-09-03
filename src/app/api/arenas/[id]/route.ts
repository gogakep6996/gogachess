import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

interface PatchBody {
  /** 'start' — начать не дожидаясь назначенного времени. */
  action?: string;
}

/** Создатель может начать турнир раньше назначенного времени. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const { id } = await params;

  const arena = await prisma.arena.findUnique({
    where: { id },
    select: { ownerId: true, status: true },
  });
  if (!arena) return NextResponse.json({ error: 'Турнир не найден' }, { status: 404 });
  if (arena.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Это турнир другого человека' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос' }, { status: 400 });
  }

  if (body.action !== 'start') {
    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }
  if (arena.status !== 'scheduled') {
    return NextResponse.json({ error: 'Турнир уже начался' }, { status: 400 });
  }

  // Сам переход в «идёт» делает сервер турниров: он видит новое время старта
  // и сразу же начинает подбирать пары.
  await prisma.arena.update({ where: { id }, data: { startsAt: new Date() } });
  return NextResponse.json({ ok: true });
}

/** Удалить можно свой турнир, который ещё не начался или уже закончился. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const { id } = await params;

  const arena = await prisma.arena.findUnique({
    where: { id },
    select: { ownerId: true, status: true },
  });
  if (!arena) return NextResponse.json({ error: 'Турнир не найден' }, { status: 404 });
  if (arena.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Это турнир другого человека' }, { status: 403 });
  }
  if (arena.status === 'running') {
    return NextResponse.json(
      { error: 'Турнир идёт — дождитесь окончания, иначе люди потеряют партии' },
      { status: 400 },
    );
  }

  await prisma.arena.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
