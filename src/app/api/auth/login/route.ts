import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken, setAuthCookie, verifyPassword } from '@/lib/auth';
import { checkLimit, getClientIp } from '@/lib/rate-limit';
import { verifyCaptcha } from '@/lib/captcha';

interface Body {
  identifier: string;
  password: string;
  /** Токен невидимой Yandex SmartCaptcha (если капча настроена). */
  captchaToken?: string;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Защита от перебора паролей: 20 попыток в час с одного адреса.
  // Живому человеку этого хватает с запасом, скрипту — нет.
  const limit = checkLimit({ key: `login:${ip}`, max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте через час.' },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const identifier = (body.identifier || '').trim();
  const password = body.password || '';
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
  }

  const captchaOk = await verifyCaptcha(body.captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json({ error: 'Не удалось пройти проверку «я не бот»' }, { status: 400 });
  }

  const cleaned = identifier.includes('@')
    ? identifier.toLowerCase()
    : identifier.replace(/\s|-/g, '');

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: cleaned }, { phone: cleaned }] },
  });
  if (!user) {
    return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
  }

  const token = signToken({ sub: user.id, name: user.displayName });
  await setAuthCookie(token);

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  });
}
