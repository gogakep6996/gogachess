// Разбор JWT из куки chess_token. Нужен и основному пространству имён сокета,
// и пространству арены, поэтому живёт отдельным модулем.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'chess_token';

export interface AuthPayload {
  sub: string;
  name: string;
}

export function parseAuthCookie(cookieHeader: string | undefined): AuthPayload | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}
