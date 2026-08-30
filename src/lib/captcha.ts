/**
 * Серверная проверка Yandex SmartCaptcha.
 *
 * Клиент рендерит виджет → получает одноразовый токен → присылает его на сервер →
 * сервер спрашивает у SmartCaptcha, человек это или робот.
 *
 * Раньше здесь была Cloudflare Turnstile. Заменена намеренно: Cloudflare —
 * иностранный сервис, и IP-адреса посетителей уходили бы за пределы РФ, что
 * пришлось бы объявлять в политике как трансграничную передачу.
 *
 * Включается, если задан SMARTCAPTCHA_SERVER_KEY. Без него `verifyCaptcha`
 * всегда возвращает true, то есть локальная разработка не требует ключей.
 *
 * См. .env.example: SMARTCAPTCHA_SERVER_KEY (бэкенд),
 * NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY (виджет).
 */

const VALIDATE_URL = 'https://smartcaptcha.cloud.yandex.ru/validate';

interface ValidateResponse {
  /** 'ok' — человек, 'failed' — робот либо ошибка в запросе. */
  status: 'ok' | 'failed';
  /** Заполнено только при ошибке запроса; для диагностики, не для сравнений. */
  message?: string;
  host?: string;
}

/**
 * Возвращает true, если проверка пройдена ИЛИ если капча не настроена.
 * Возвращает false при настроенной капче и отсутствующем/отклонённом токене.
 *
 * При сбое связи с SmartCaptcha пользователь пропускается: так рекомендует
 * документация Яндекса, чтобы недоступность сервиса не блокировала регистрацию.
 * От перебора в этом окне защищает лимитер из lib/rate-limit.ts.
 */
export async function verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.SMARTCAPTCHA_SERVER_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, token });
  if (ip) body.set('ip', ip);

  try {
    const res = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      console.warn(`[captcha] SmartCaptcha ответила HTTP ${res.status} — пропускаем проверку`);
      return true;
    }

    const data = (await res.json()) as ValidateResponse;
    if (data.status !== 'ok' && data.message) {
      console.error(`[captcha] SmartCaptcha отклонила токен: ${data.message}`);
    }
    return data.status === 'ok';
  } catch (err) {
    console.error('[captcha] не удалось связаться с SmartCaptcha:', err);
    return true;
  }
}

/** Удобный флаг для UI: показывать ли виджет на странице. */
export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY);
}
