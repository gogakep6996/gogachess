import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/summary — счётчик для меню аккаунта: входящие заявки в друзья.
 *
 * Личная переписка с сайта убрана (общение только на уроке), поэтому счётчика
 * непрочитанных сообщений здесь больше нет.
 */
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const pendingFriends = await prisma.friendship.count({
    where: { addresseeId: auth.sub, status: 'pending' },
  });

  return NextResponse.json({ pendingFriends });
}
