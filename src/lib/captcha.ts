/**
 * Опциональная серверная проверка Cloudflare Turnstile.
 *
 * Turnstile — бесплатная капча без отслеживания (CAPTCHA-альтернатива reCAPTCHA).
 * Клиент рендерит виджет → получает токен → пересылает его на сервер →
 * сервер делает запрос к https://challenges.cloudflare.com/turnstile/v0/siteverify.
 *
 * Включается, если задан TURNSTILE_SECRET_KEY. Без него `verifyCaptcha`
 * всегда возвращает true (т.е. в локалке/MVP не мешает работать).
 *
 * См. .env.example: TURNSTILE_SECRET_KEY (бэкенд), NEXT_PUBLIC_TURNSTILE_SITE_KEY (виджет).
 */

interface VerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Возвращает true, если капча валидна ИЛИ если Turnstile не настроен (тогда
 * проверка просто пропускается). Возвращает false только при настроенном
 * Turnstile и невалидном/отсутствующем токене.
 */
export async function verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as VerifyResponse;
    return data.success === true;
  } catch (err) {
    console.error('[captcha] verify failed:', err);
    return false;
  }
}

/** Удобный флаг для UI: показывать ли виджет на странице. */
export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
