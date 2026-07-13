import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/summary — счётчики для меню аккаунта:
 * непрочитанные личные сообщения и входящие заявки в друзья.
 */
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const [unreadDms, pendingFriends] = await Promise.all([
    prisma.directMessage.count({ where: { toId: auth.sub, readAt: null } }),
    prisma.friendship.count({ where: { addresseeId: auth.sub, status: 'pending' } }),
  ]);

  return NextResponse.json({ unreadDms, pendingFriends });
}
