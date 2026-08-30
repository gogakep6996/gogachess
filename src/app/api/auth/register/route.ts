import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie } from '@/lib/auth';
import { sendVerifyEmail } from '@/lib/email/flows';
import { checkLimit, getClientIp } from '@/lib/rate-limit';
import { verifyCaptcha } from '@/lib/captcha';
import { LEGAL_VERSION } from '@/lib/legal';

interface Body {
  email: string;
  password: string;
  displayName: string;
  /** Токен Yandex SmartCaptcha (если капча настроена, см. lib/captcha.ts). */
  captchaToken?: string;
  /**
   * Галочка под формой: подтверждение возраста, согласие на обработку
   * персональных данных и принятие документов сайта. Проверяется на сервере —
   * в браузере её можно обойти прямым запросом к API.
   */
  acceptedTerms?: boolean;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Не даём ботам массово создавать аккаунты: 5 попыток в час с одного IP.
  // На реальных пользователей это не давит — они регистрируются один раз.
  const limit = checkLimit({ key: `register:${ip}`, max: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток регистрации с этого адреса. Попробуйте через час.' },
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
  const password = body.password || '';
  const displayName = (body.displayName || '').trim().slice(0, 64);

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
  }
  if (!EMAIL_RX.test(email)) {
    return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Пароль минимум ${MIN_PASSWORD} символов` },
      { status: 400 },
    );
  }
  if (displayName.length < 2) {
    return NextResponse.json({ error: 'Имя слишком короткое' }, { status: 400 });
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      {
        error:
          'Нужно подтвердить возраст, согласие на обработку персональных данных и принять документы сайта',
      },
      { status: 400 },
    );
  }

  // Капча проверяется на сервере (Yandex SmartCaptcha). Если переменные не заданы —
  // verifyCaptcha вернёт true и пропустит, см. lib/captcha.ts.
  const captchaOk = await verifyCaptcha(body.captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json({ error: 'Не удалось пройти проверку «я не бот»' }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: 'Пользователь с таким email уже зарегистрирован' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      // emailVerifiedAt оставляем null — пользователь должен подтвердить почту.
      // Доказательство согласия: время, редакция документов и обстоятельства действия.
      consentAcceptedAt: new Date(),
      consentDocumentVersion: LEGAL_VERSION,
      consentIp: ip,
      consentUserAgent: (request.headers.get('user-agent') || '').slice(0, 512) || null,
    },
  });

  // Пользователя сразу логиним (мягкий режим — можно смотреть сайт без подтверждения,
  // но создавать классы/турниры — только после клика по ссылке из письма).
  const token = signToken({ sub: user.id, name: user.displayName });
  await setAuthCookie(token);

  // Отправка письма не должна валить регистрацию: если Resend временно лёг,
  // пользователь получит шанс нажать «отправить ещё раз» из плашки.
  try {
    await sendVerifyEmail({ userId: user.id, email, displayName });
  } catch (err) {
    console.error('[auth/register] sendVerifyEmail failed:', err);
  }

  // Приветственное уведомление (видно в меню аккаунта). Некритично.
  try {
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Добро пожаловать в gogachess!',
        body: 'Подтвердите почту по ссылке из письма — после этого откроются все функции: классы, турниры.',
      },
    });
  } catch (err) {
    console.error('[auth/register] notification failed:', err);
  }

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
