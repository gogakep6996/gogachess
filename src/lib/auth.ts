import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'chess_token';
const TOKEN_TTL = '30d';

export interface AuthPayload {
  sub: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Проверка: пользователь залогинен И подтвердил email.
 * Используется на API-эндпоинтах, требующих verified-аккаунта
 * (создание класса, турнира — то, что может быть использовано для спама).
 *
 * Возвращает { ok: true, userId } или { ok: false, error: '...' } с готовым
 * человекочитаемым сообщением. Сами Response-ответы строит вызывающий код.
 */
export type RequireVerifiedResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireVerifiedUser(): Promise<RequireVerifiedResult> {
  const auth = await getCurrentUser();
  if (!auth) return { ok: false, status: 401, error: 'Не авторизован' };
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, status: 401, error: 'Сессия устарела, войдите заново' };
  // В режиме разработки (локальный хост) не требуем подтверждения email —
  // чтобы можно было тестировать классы/турниры без почтового сервера.
  // На проде (NODE_ENV=production) проверка работает как обычно.
  if (process.env.NODE_ENV !== 'production' && !user.emailVerifiedAt) {
    return { ok: true, userId: user.id };
  }
  if (!user.emailVerifiedAt) {
    return {
      ok: false,
      status: 403,
      error: 'Подтвердите email — мы отправили вам письмо со ссылкой.',
    };
  }
  return { ok: true, userId: user.id };
}

export const AUTH_COOKIE = COOKIE_NAME;
