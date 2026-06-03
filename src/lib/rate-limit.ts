/**
 * Простой in-memory rate-limiter (фиксированное окно).
 *
 * Хранит счётчики в памяти процесса. Это нормально для single-instance VPS
 * (наш случай) — но не выживает рестарт контейнера и не делится между нодами.
 * Если в будущем вырастем до кластера — заменить на Redis-counter.
 *
 * Использование:
 *   const limited = checkLimit({ key: `register:${ip}`, max: 5, windowMs: 3600_000 });
 *   if (!limited.ok) return 429;
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Раз в 5 минут чистим протухшие ключи, чтобы Map не рос бесконечно.
const SWEEP_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function maybeSweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

interface CheckArgs {
  /** Уникальный ключ (обычно `endpoint:ip` или `endpoint:userId`). */
  key: string;
  /** Сколько запросов разрешено в окне. */
  max: number;
  /** Окно в миллисекундах. */
  windowMs: number;
}

interface CheckResult {
  ok: boolean;
  /** Сколько осталось в окне (после текущего запроса). */
  remaining: number;
  /** Когда окно сбросится (epoch ms). */
  resetAt: number;
}

export function checkLimit({ key, max, windowMs }: CheckArgs): CheckResult {
  maybeSweep();
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { ok: true, remaining: max - 1, resetAt: next.resetAt };
  }
  existing.count += 1;
  const ok = existing.count <= max;
  return {
    ok,
    remaining: Math.max(0, max - existing.count),
    resetAt: existing.resetAt,
  };
}

/**
 * Извлечь IP-адрес клиента из стандартных заголовков, в правильном порядке:
 * Cloudflare → стандартный Forwarded-For → fallback на «unknown».
 * Используется как часть ключа rate-limit.
 */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = h.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
