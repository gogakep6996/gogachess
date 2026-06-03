/**
 * HTML/text-шаблоны писем. Намеренно простые, без CSS-инлайнера и
 * без внешних картинок — чтобы:
 *   - письма выглядели одинаково в gmail/яндекс/mail.ru/outlook;
 *   - не тригерили антиспам (внешние трекеры → спам).
 *
 * Все ссылки — на SITE_URL (без него письма не имеют смысла).
 */

import type { EmailMessage } from './sender';

const BRAND = 'GogaChess';

interface VerifyArgs {
  to: string;
  displayName: string;
  /** Полная ссылка вида https://site.ru/verify?token=... */
  link: string;
  /** Срок действия в часах (просто для текста письма). */
  expiresHours: number;
}

export function buildVerifyEmail(args: VerifyArgs): EmailMessage {
  const greeting = args.displayName ? `Привет, ${escape(args.displayName)}!` : 'Привет!';
  const subject = `${BRAND}: подтвердите вашу почту`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 16px;font-size:20px;color:#1f2937;">${greeting}</h1>
    <p style="margin:0 0 16px;color:#374151;line-height:1.5;">
      Вы (или кто-то от вашего имени) указали этот адрес при регистрации на ${BRAND}.
      Чтобы завершить создание аккаунта и обезопасить его, подтвердите почту:
    </p>
    ${button(args.link, 'Подтвердить email')}
    <p style="margin:24px 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
      Ссылка действует ${args.expiresHours} ${pluralHours(args.expiresHours)}.
      Если кнопка не работает, скопируйте ссылку в браузер:
    </p>
    <p style="margin:0 0 16px;word-break:break-all;font-size:13px;color:#1d4ed8;">
      <a href="${args.link}" style="color:#1d4ed8;text-decoration:underline;">${escape(args.link)}</a>
    </p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      Если это были не вы — просто проигнорируйте письмо, аккаунт не активируется без подтверждения.
    </p>
  `);
  const text =
    `${greeting}\n\n` +
    `Подтвердите email на ${BRAND}, перейдя по ссылке:\n${args.link}\n\n` +
    `Ссылка действует ${args.expiresHours} ${pluralHours(args.expiresHours)}.\n` +
    `Если это были не вы — проигнорируйте письмо.\n`;
  return { to: args.to, subject, html, text };
}

interface ResetArgs {
  to: string;
  displayName: string;
  link: string;
  expiresMinutes: number;
}

export function buildPasswordResetEmail(args: ResetArgs): EmailMessage {
  const greeting = args.displayName ? `Привет, ${escape(args.displayName)}!` : 'Привет!';
  const subject = `${BRAND}: сброс пароля`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 16px;font-size:20px;color:#1f2937;">${greeting}</h1>
    <p style="margin:0 0 16px;color:#374151;line-height:1.5;">
      Поступил запрос на сброс пароля от вашего аккаунта на ${BRAND}.
      Если это были вы — нажмите кнопку ниже, чтобы задать новый пароль:
    </p>
    ${button(args.link, 'Сбросить пароль')}
    <p style="margin:24px 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
      Ссылка действует ${args.expiresMinutes} минут.
      Если кнопка не работает, скопируйте ссылку в браузер:
    </p>
    <p style="margin:0 0 16px;word-break:break-all;font-size:13px;color:#1d4ed8;">
      <a href="${args.link}" style="color:#1d4ed8;text-decoration:underline;">${escape(args.link)}</a>
    </p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      Если вы НЕ запрашивали сброс — никаких действий не нужно, текущий пароль остаётся в силе.
    </p>
  `);
  const text =
    `${greeting}\n\n` +
    `Сброс пароля на ${BRAND}. Перейдите по ссылке, чтобы задать новый пароль:\n${args.link}\n\n` +
    `Ссылка действует ${args.expiresMinutes} минут.\n` +
    `Если вы не запрашивали сброс — игнорируйте письмо.\n`;
  return { to: args.to, subject, html, text };
}

// ----------------------------------------------------------------------------

function button(href: string, label: string): string {
  return (
    `<p style="margin:0 0 24px;">` +
    `<a href="${href}" style="display:inline-block;padding:12px 24px;` +
    `background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;` +
    `font-weight:600;font-size:14px;">${escape(label)}</a></p>`
  );
}

function wrapHtml(inner: string): string {
  return (
    `<!doctype html><html lang="ru"><body style="margin:0;padding:0;background:#f3f4f6;font-family:` +
    `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">` +
    `<tr><td>` +
    `<div style="margin:0 0 24px;font-weight:700;font-size:14px;letter-spacing:0.08em;color:#6b7280;text-transform:uppercase;">${BRAND}</div>` +
    inner +
    `<hr style="margin:32px 0 16px;border:0;border-top:1px solid #e5e7eb;" />` +
    `<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">` +
    `Это письмо отправлено автоматически. Не отвечайте на него.` +
    `</p>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pluralHours(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'часов';
  if (mod10 === 1) return 'час';
  if (mod10 >= 2 && mod10 <= 4) return 'часа';
  return 'часов';
}
