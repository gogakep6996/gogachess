import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie } from '@/lib/auth';
import { lookupAuthToken, consumeAuthToken } from '@/lib/auth-tokens';

interface Body {
  token: string;
  password: string;
}

const MIN_PASSWORD = 8;

/**
 * Применить сброс пароля по одноразовому токену из письма.
 * При успехе токен расходуется, новый пароль сохраняется (bcrypt),
 * сессия пользователя обновляется (старая JWT-кука перезаписывается).
 *
 * Бонусом: если у пользователя ещё не был подтверждён email — после сброса
 * пароля подтверждение тоже ставится. Логика: раз он смог прочитать письмо,
 * значит почта точно его (тот же контроль доступа, что и в verify-email).
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  const password = body.password || '';
  if (!token) {
    return NextResponse.json({ error: 'Ссылка некорректна' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Пароль минимум ${MIN_PASSWORD} символов` },
      { status: 400 },
    );
  }

  const hit = await lookupAuthToken(token, 'password-reset');
  if (!hit) {
    return NextResponse.json(
      { error: 'Ссылка недействительна или устарела. Запросите сброс заново.' },
      { status: 400 },
    );
  }
  await consumeAuthToken(hit.id);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.update({
    where: { id: hit.userId },
    data: {
      passwordHash,
      // Если до сброса email не был подтверждён — подтверждаем (см. комментарий выше).
      emailVerifiedAt: { set: new Date() },
    },
  });

  const jwt = signToken({ sub: user.id, name: user.displayName });
  await setAuthCookie(jwt);
  return NextResponse.json({ ok: true });
}
