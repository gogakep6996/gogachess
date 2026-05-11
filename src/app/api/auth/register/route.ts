import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie } from '@/lib/auth';

interface Body {
  identifier: string; // email или телефон
  password: string;
  displayName: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^\+?[0-9]{10,15}$/;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const { identifier, password, displayName } = body;
  if (!identifier || !password || !displayName) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Пароль минимум 6 символов' }, { status: 400 });
  }

  const isEmail = EMAIL_RX.test(identifier);
  const isPhone = PHONE_RX.test(identifier.replace(/\s|-/g, ''));
  if (!isEmail && !isPhone) {
    return NextResponse.json({ error: 'Введите корректный email или телефон' }, { status: 400 });
  }

  const cleaned = isPhone ? identifier.replace(/\s|-/g, '') : identifier.toLowerCase();

  const exists = await prisma.user.findFirst({
    where: isEmail ? { email: cleaned } : { phone: cleaned },
  });
  if (exists) {
    return NextResponse.json({ error: 'Пользователь уже существует' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: isEmail ? cleaned : null,
      phone: isPhone ? cleaned : null,
      passwordHash,
      displayName: displayName.trim().slice(0, 64),
    },
  });

  const token = signToken({ sub: user.id, name: user.displayName });
  await setAuthCookie(token);

  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, email: user.email, phone: user.phone },
  });
}
