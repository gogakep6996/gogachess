import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

/**
 * Одноразовые токены для email-flow.
 *
 * Принцип безопасности: «сырой» токен уходит пользователю в письме (живёт в URL),
 * а в БД хранится только SHA-256 хэш. Утечка БД не позволит использовать токены —
 * хэш необратим, а сравнение делается по hex(hash(raw)).
 *
 * Длина 32 случайных байта (256 бит энтропии) → перебор практически невозможен,
 * хэш достаточно даже без соли.
 */

export type TokenKind = 'email-verify' | 'password-reset';

const TTL_BY_KIND: Record<TokenKind, number> = {
  // Подтверждение email — 24 часа: пользователь мог отвлечься.
  'email-verify': 24 * 60 * 60 * 1000,
  // Сброс пароля — 1 час: ссылка чувствительнее, окно короче.
  'password-reset': 60 * 60 * 1000,
};

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Сгенерировать «сырой» токен (urlsafe base64, ~43 символа). */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Создать новый токен, сохранить хэш в БД и вернуть сырой токен (для письма).
 * Старые неиспользованные токены того же типа у того же пользователя
 * автоматически расходуются (помечаются usedAt=now) — на пользователя
 * валиден только последний выданный токен. Это гасит атаки с накоплением
 * токенов и неожиданное повторное срабатывание старой ссылки.
 */
export async function issueAuthToken(
  userId: string,
  kind: TokenKind,
): Promise<{ token: string; expiresAt: Date }> {
  await prisma.authToken.updateMany({
    where: { userId, kind, usedAt: null },
    data: { usedAt: new Date() },
  });
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + TTL_BY_KIND[kind]);
  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash: sha256Hex(raw),
      expiresAt,
    },
  });
  return { token: raw, expiresAt };
}

/**
 * Найти валидный токен (не истёкший, не использованный). Возвращает userId
 * или null. НЕ помечает токен как использованный — это нужно делать отдельно
 * методом `consumeAuthToken`, чтобы вызывающий код мог сначала проверить
 * сопутствующие условия (например, что новый пароль удовлетворяет политике).
 */
export async function lookupAuthToken(
  rawToken: string,
  kind: TokenKind,
): Promise<{ id: string; userId: string } | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = sha256Hex(rawToken);
  const row = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.kind !== kind) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, userId: row.userId };
}

/** Пометить токен как использованный. Безопасно вызывать дважды. */
export async function consumeAuthToken(id: string): Promise<void> {
  await prisma.authToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
}

/**
 * Чистка просроченных токенов. Можно дёргать из cron или вручную;
 * не критично — записи копятся медленно (десятки в день максимум).
 */
export async function purgeExpiredAuthTokens(): Promise<number> {
  const res = await prisma.authToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  return res.count;
}
