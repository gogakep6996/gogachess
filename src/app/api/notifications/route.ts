import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/** Последние уведомления текущего пользователя + счётчик непрочитанных. */
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: auth.sub, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unread });
}

/** Пометить все уведомления прочитанными (вызывается при открытии списка). */
export async function POST() {
  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  await prisma.notification.updateMany({
    where: { userId: auth.sub, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
