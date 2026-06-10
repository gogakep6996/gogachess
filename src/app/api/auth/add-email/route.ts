import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { sendVerifyEmail } from '@/lib/email/flows';
import { checkLimit, getClientIp } from '@/lib/rate-limit';

interface Body {
  email: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Добавление (или замена неподтверждённой) почты у текущего аккаунта.
 * Нужно прежде всего тем, кто зарегистрирован по телефону и не может
 * пройти email-подтверждение. После сохранения сразу шлём письмо.
 */
export async function POST(request: Request) {
  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipLimit = checkLimit({ key: `add-email:ip:${ip}`, max: 10, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RX.test(email)) {
    return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user) {
    return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
  }

  // Подтверждённую почту через эту ручку не меняем — это отдельный
  // чувствительный сценарий (нужно подтверждение со старой почты).
  if (user.email && user.emailVerifiedAt) {
    return NextResponse.json(
      { error: 'Почта уже подтверждена. Для смены напишите администратору.' },
      { status: 400 },
    );
  }

  // Почта не должна принадлежать другому аккаунту.
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== user.id) {
    return NextResponse.json(
      { error: 'Эта почта уже используется другим аккаунтом' },
      { status: 409 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { email, emailVerifiedAt: null },
  });

  // Письмо не должно валить сохранение почты: при сбое пользователь
  // отправит повторно из меню аккаунта.
  let emailSent = true;
  try {
    await sendVerifyEmail({ userId: user.id, email, displayName: user.displayName });
  } catch (err) {
    console.error('[auth/add-email] sendVerifyEmail failed:', err);
    emailSent = false;
  }

  return NextResponse.json({ ok: true, email, emailSent });
}
