// Звуки «Развлекательных шахмат» — синтез через Web Audio (без файлов).
// У каждого типа оружия свой удар: меч (свист), молот (грохот), магия (перелив).
// Отдельный модуль от lib/sounds.ts: там реальные сэмплы дерева, здесь — синтез.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;

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
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Разблокировка AudioContext первым пользовательским жестом. */
export function unlockFunSounds(): void {
  if (typeof window === 'undefined' || unlocked) return;
  unlocked = true;
  const fn = () => {
    getCtx();
    window.removeEventListener('pointerdown', fn);
    window.removeEventListener('keydown', fn);
  };
  window.addEventListener('pointerdown', fn, { passive: true });
  window.addEventListener('keydown', fn);
}

/** Короткий буфер белого шума (переиспользуется всеми ударами). */
let noiseBuf: AudioBuffer | null = null;
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.5);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function envGain(c: AudioContext, t0: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(master!);
  return g;
}

function noiseHit(c: AudioContext, t0: number, opts: { type: BiquadFilterType; from: number; to: number; dur: number; gain: number; q?: number }): void {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = opts.type;
  f.frequency.setValueAtTime(opts.from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 40), t0 + opts.dur);
  if (opts.q) f.Q.value = opts.q;
  const g = envGain(c, t0, opts.gain, 0.008, opts.dur);
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.05);
}

function tone(
  c: AudioContext,
  t0: number,
  opts: { wave?: OscillatorType; from: number; to?: number; dur: number; gain: number; attack?: number },
): void {
  const o = c.createOscillator();
  o.type = opts.wave ?? 'sine';
  o.frequency.setValueAtTime(opts.from, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  const g = envGain(c, t0, opts.gain, opts.attack ?? 0.01, opts.dur);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + opts.dur + 0.05);
}

/** Обычный ход — мягкий «шаг» фигуры. */
export function playFunMove(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, { wave: 'sine', from: 190, to: 120, dur: 0.09, gain: 0.35 });
  noiseHit(c, t, { type: 'lowpass', from: 900, to: 300, dur: 0.07, gain: 0.18 });
}

/** Удар меча/копья — свист + звон. */
export function playFunSlash(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  noiseHit(c, t, { type: 'bandpass', from: 3200, to: 700, dur: 0.2, gain: 0.5, q: 1.2 });
  tone(c, t + 0.05, { wave: 'triangle', from: 2400, to: 1100, dur: 0.16, gain: 0.22 });
  tone(c, t + 0.06, { wave: 'sine', from: 160, to: 90, dur: 0.12, gain: 0.4 });
}

/** Удар молота — низкий грохот. */
export function playFunSmash(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, { wave: 'sine', from: 130, to: 45, dur: 0.3, gain: 0.85, attack: 0.005 });
  noiseHit(c, t, { type: 'lowpass', from: 1800, to: 200, dur: 0.24, gain: 0.55 });
  noiseHit(c, t + 0.02, { type: 'highpass', from: 4000, to: 6000, dur: 0.08, gain: 0.12 });
}

/** Магический удар — восходящий перелив + искры. */
export function playFunMagic(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const notes = [660, 990, 1320];
  notes.forEach((f, i) => {
    tone(c, t + i * 0.055, { wave: 'sine', from: f, to: f * 1.06, dur: 0.22, gain: 0.24 });
  });
  noiseHit(c, t + 0.03, { type: 'highpass', from: 5000, to: 9000, dur: 0.3, gain: 0.1 });
  tone(c, t + 0.05, { wave: 'sine', from: 140, to: 80, dur: 0.18, gain: 0.3 });
}

/** Шах — короткий тревожный сигнал. */
export function playFunCheck(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, { wave: 'triangle', from: 620, dur: 0.1, gain: 0.22 });
  tone(c, t + 0.11, { wave: 'triangle', from: 780, dur: 0.14, gain: 0.22 });
}

/** Победная фанфара (мат). */
export function playFunVictory(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const seq: Array<[number, number, number]> = [
    [523, 0, 0.16],
    [659, 0.14, 0.16],
    [784, 0.28, 0.16],
    [1046, 0.42, 0.42],
  ];
  for (const [f, dt, dur] of seq) {
    tone(c, t + dt, { wave: 'triangle', from: f, dur, gain: 0.3 });
    tone(c, t + dt, { wave: 'sine', from: f / 2, dur, gain: 0.18 });
  }
}

/** Поражение — нисходящий мотив. */
export function playFunDefeat(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const seq: Array<[number, number, number]> = [
    [392, 0, 0.22],
    [330, 0.2, 0.22],
    [262, 0.4, 0.4],
  ];
  for (const [f, dt, dur] of seq) {
    tone(c, t + dt, { wave: 'triangle', from: f, dur, gain: 0.26 });
  }
}
