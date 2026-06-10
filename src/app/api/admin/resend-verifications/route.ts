import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { sendVerifyEmail } from '@/lib/email/flows';

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Массовая рассылка писем подтверждения всем пользователям с почтой,
 * но без emailVerifiedAt. Доступна только админам (ADMIN_EMAILS).
 *
 * Шлём последовательно, чтобы не упереться в лимиты SMTP; ошибка по одному
 * адресу не прерывает рассылку остальным.
 */
export async function POST() {
  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { email: true },
  });
  const admins = getAdminEmails();
  const myEmail = me?.email?.toLowerCase() ?? '';
  if (admins.length === 0 || !myEmail || !admins.includes(myEmail)) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: { email: { not: null }, emailVerifiedAt: null },
    select: { id: true, email: true, displayName: true },
  });

  let sent = 0;
  const failed: string[] = [];
  for (const u of users) {
    if (!u.email) continue;
    try {
      await sendVerifyEmail({ userId: u.id, email: u.email, displayName: u.displayName });
      sent++;
    } catch (err) {
      console.error(`[admin/resend-verifications] failed for ${u.email}:`, err);
      failed.push(u.email);
    }
  }

  return NextResponse.json({ ok: true, total: users.length, sent, failed });
}
