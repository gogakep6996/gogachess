import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken, setAuthCookie, verifyPassword } from '@/lib/auth';

interface Body {
  identifier: string;
  password: string;
}

export async function POST(request: Request) {
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
    user: { id: user.id, displayName: user.displayName, email: user.email, phone: user.phone },
  });
}
