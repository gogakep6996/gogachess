/**
 * Высокоуровневые сценарии: «отправить письмо подтверждения», «отправить сброс пароля».
 * Здесь живёт связка `issueAuthToken` + сборка ссылки + отправка письма.
 *
 * Ничего не возвращает «сырой» токен наружу — он живёт только в письме.
 */

import { issueAuthToken } from '@/lib/auth-tokens';
import { getEmailSender } from './sender';
import { buildVerifyEmail, buildPasswordResetEmail } from './templates';

/** Строит абсолютный URL вида `${SITE_URL}/${path}?token=...`. */
function buildLink(path: string, token: string): string {
  // SITE_URL должен быть в env (см. .env.example). В dev допускаем localhost.
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

interface SendVerifyArgs {
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Создать токен подтверждения email и отправить письмо.
 * Бросает, если provider недоступен — вызывающий код должен решить,
 * как реагировать (обычно: залогировать и вернуть 200 пользователю,
 * чтобы он мог запросить повторную отправку).
 */
export async function sendVerifyEmail(args: SendVerifyArgs): Promise<void> {
  const { token, expiresAt } = await issueAuthToken(args.userId, 'email-verify');
  const link = buildLink('/verify', token);
  const expiresHours = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 3_600_000));
  const message = buildVerifyEmail({
    to: args.email,
    displayName: args.displayName,
    link,
    expiresHours,
  });
  await getEmailSender().send(message);
}

interface SendResetArgs {
  userId: string;
  email: string;
  displayName: string;
}

export async function sendPasswordResetEmail(args: SendResetArgs): Promise<void> {
  const { token, expiresAt } = await issueAuthToken(args.userId, 'password-reset');
  const link = buildLink('/reset-password', token);
  const expiresMinutes = Math.max(5, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  const message = buildPasswordResetEmail({
    to: args.email,
    displayName: args.displayName,
    link,
    expiresMinutes,
  });
  await getEmailSender().send(message);
}
