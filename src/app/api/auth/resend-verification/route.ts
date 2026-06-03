import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { sendVerifyEmail } from '@/lib/email/flows';
import { checkLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Повторная отправка письма подтверждения. Требует залогиненного пользователя
 * (мягкий режим — войти можно без подтверждения, но resend защищаем от спама).
 *
 * Rate-limit:
 *   - 1 раз / 60 сек на пользователя — защита от двойного клика по кнопке.
 *   - 10 раз / час на IP — защита от перебора чужих аккаунтов через эту ручку.
 */
export async function POST(request: Request) {
  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipLimit = checkLimit({ key: `resend:ip:${ip}`, max: 10, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429 },
    );
  }
  const userLimit = checkLimit({ key: `resend:user:${auth.sub}`, max: 1, windowMs: 60 * 1000 });
  if (!userLimit.ok) {
    const wait = Math.max(1, Math.ceil((userLimit.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Подождите ${wait} сек перед повторной отправкой` },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || !user.email) {
    return NextResponse.json(
      { error: 'У вашего аккаунта не указан email — добавьте его в настройках' },
      { status: 400 },
    );
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  try {
    await sendVerifyEmail({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (err) {
    console.error('[auth/resend] sendVerifyEmail failed:', err);
    return NextResponse.json(
      { error: 'Не удалось отправить письмо. Попробуйте позже.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
