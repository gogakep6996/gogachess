import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { lookupAuthToken, consumeAuthToken } from '@/lib/auth-tokens';
import { getCurrentUser } from '@/lib/auth';

interface Body {
  token: string;
}

/**
 * Расход одноразового токена подтверждения email.
 * Если токен валиден — ставим User.emailVerifiedAt = now() и сжигаем токен.
 * Если уже подтверждён — возвращаем 200 как идемпотентный успех.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Ссылка некорректна' }, { status: 400 });
  }

  const hit = await lookupAuthToken(token, 'email-verify');
  if (!hit) {
    // Может означать: не существует / просрочен / уже использован / неверный тип.
    // Сообщение специально размытое, чтобы не давать злоумышленнику фидбэк.
    return NextResponse.json(
      {
        error:
          'Ссылка недействительна или устарела. Войдите в аккаунт и запросите новое письмо.',
      },
      { status: 400 },
    );
  }

  // Помечаем токен использованным ДО апдейта пользователя, чтобы
  // повторный клик по той же ссылке не дёргал лишние записи.
  await consumeAuthToken(hit.id);

  await prisma.user.update({
    where: { id: hit.userId },
    data: { emailVerifiedAt: new Date() },
  });

  // Уведомление в меню аккаунта. Некритично — ошибки глотаем.
  try {
    await prisma.notification.create({
      data: {
        userId: hit.userId,
        title: 'Почта подтверждена ✓',
        body: 'Теперь вам доступны все функции сайта: создание класса, турниры.',
      },
    });
  } catch (err) {
    console.error('[auth/verify-email] notification failed:', err);
  }

  // Если по этой ссылке кликнул другой пользователь (или сессия другая) —
  // токен всё равно сработал для нужного userId. Просто сообщаем UI.
  const auth = await getCurrentUser();
  const isSelf = auth?.sub === hit.userId;

  return NextResponse.json({ ok: true, isSelf });
}
