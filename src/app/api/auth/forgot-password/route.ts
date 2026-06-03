import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email/flows';
import { checkLimit, getClientIp } from '@/lib/rate-limit';

interface Body {
  email: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Старт сброса пароля. ВАЖНО: даже если email НЕ зарегистрирован,
 * мы возвращаем 200 и не подсказываем атакующему, какие почты есть в системе
 * (стандартная практика, чтобы /forgot-password не работал как user enumeration).
 *
 * Письмо отправляется ТОЛЬКО если пользователь реально существует.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkLimit({ key: `forgot:${ip}`, max: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте через час.' },
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

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.email) {
    try {
      await sendPasswordResetEmail({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      });
    } catch (err) {
      console.error('[auth/forgot] sendPasswordResetEmail failed:', err);
      // Не палим существование пользователя — клиенту всё равно 200.
    }
  }

  return NextResponse.json({ ok: true });
}
