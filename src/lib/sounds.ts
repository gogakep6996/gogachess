// Синтез «живых» деревянных звуков через Web Audio (без файлов).
// Ход — лёгкое касание фигуры: деревянный корпус + сухой щелчок по лаку.
// Взятие — две физические «массы»: стук о фигуру и затем о доску.

let ctx: AudioContext | null = null;
let unlockedListeners = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    type Ctor = typeof AudioContext;
    const W = window as unknown as { webkitAudioContext?: Ctor };
    const C: Ctor | undefined = window.AudioContext ?? W.webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** Один раз подписывается на пользовательский жест, чтобы «разблокировать» AudioContext. */
export function unlockSounds(): void {
  if (typeof window === 'undefined' || unlockedListeners) return;
  unlockedListeners = true;
  const fn = () => {
    getCtx();
    window.removeEventListener('pointerdown', fn);
    window.removeEventListener('keydown', fn);
    window.removeEventListener('touchstart', fn);
  };
  window.addEventListener('pointerdown', fn, { passive: true });
  window.addEventListener('keydown', fn);
  window.addEventListener('touchstart', fn, { passive: true });
}

/** Общая громкость шахматных звуков (относительно исходного микса). */
const BOARD_VOL = 3;

/** Усиление пика с ограничением, чтобы параллельные слои не клипали слишком жёстко. */
function vol(peak: number): number {
  return Math.min(peak * BOARD_VOL, 0.98);
}

/** Каждый ход чуть-чуть отличается — как на настоящей доске. */
function jitter(base: number, amt: number): number {
  return base + (Math.random() * 2 - 1) * amt;
}

function expEnvelope(
  gain: GainNode,
  t0: number,
  peak: number,
  attackSec: number,
  decaySec: number,
  c: AudioContext,
): void {
  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attackSec);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attackSec + decaySec);
}

function noiseBurst(
  c: AudioContext,
  t: number,
  durSec: number,
  centerHz: number,
  q: number,
  peakGain: number,
): void {
  const len = Math.max(1, Math.floor(c.sampleRate * durSec));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  const tau = c.sampleRate * 0.012;
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = centerHz;
  bp.Q.value = q;
  const gain = c.createGain();
  expEnvelope(gain, t, vol(peakGain), 0.0008, durSec * 0.55, c);
  src.connect(bp).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + durSec + 0.02);
}

/** Низкая «коробочная» резонансная нота дерева (доска гудит миллисекунду). */
function woodBody(
  c: AudioContext,
  t: number,
  freq: number,
  peak: number,
  decaySec: number,
  type: OscillatorType,
): void {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const gain = c.createGain();
  expEnvelope(gain, t, vol(peak), 0.0012, decaySec, c);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + decaySec + 0.05);
}

/** Лёгкий «хруст» лакового слоя — узкополосный щелчок. */
function lacquerTick(c: AudioContext, t: number, strength: number): void {
  noiseBurst(c, t, 0.022, jitter(2400, 350), 2.8, 0.09 * strength);
  noiseBurst(c, t + 0.0005, 0.014, jitter(620, 80), 1.6, 0.06 * strength);
}

/**
 * Звук хода в стиле Lichess (тема Standard): короткий, чистый «клик».
 * Никакого «дерева» и резонансов — только бойкий транзиент ~60 мс.
 */
export function playMoveSound(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;

  // Главный щелчок — узкий яркий импульс в районе 1.7–2 кГц
  noiseBurst(c, t, 0.028, jitter(1850, 120), 5.5, 0.3);
  // Чуть выше — добавляет «цоканье» лака
  noiseBurst(c, t + 0.0008, 0.018, jitter(3000, 180), 4.5, 0.16);
  // Лёгкое плотное «тело», чтобы клик не звучал как дребезг
  woodBody(c, t, jitter(360, 20), 0.1, 0.028, 'sine');
}

/**
 * Звук взятия в стиле Lichess: тот же чистый клик, но плотнее и немного «низа»,
 * чтобы было чуть тяжелее обычного хода. Без эха.
 */
export function playCaptureSound(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;

  // Более насыщенный клик — шире по спектру и громче
  noiseBurst(c, t, 0.04, jitter(1500, 120), 4.5, 0.42);
  noiseBurst(c, t + 0.001, 0.028, jitter(2700, 180), 4.0, 0.22);
  // Низ — «удар по столу», коротко гаснет
  woodBody(c, t, jitter(220, 15), 0.18, 0.05, 'sine');
  woodBody(c, t + 0.004, jitter(140, 10), 0.1, 0.075, 'sine');
}
