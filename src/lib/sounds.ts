// Шахматные звуки на основе настоящих сэмплов деревянной доски
// (тема Lichess «Standard» — реальные записи деревянных фигур).
// Файлы лежат в /public/sounds/*.mp3, грузятся лениво и проигрываются через Web Audio,
// чтобы быстрые повторы не «глотались», как это бывает у <audio>.

let ctx: AudioContext | null = null;
let masterBus: GainNode | null = null;
let unlockedListeners = false;

const URLS = {
  move: '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  checkmate: '/sounds/checkmate.mp3',
} as const;

type SoundName = keyof typeof URLS;

const buffers: Partial<Record<SoundName, AudioBuffer>> = {};
const inFlight: Partial<Record<SoundName, Promise<AudioBuffer | null>>> = {};

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
    masterBus = ctx.createGain();
    // Лёгкое усиление — родной Lichess-сэмпл довольно тихий.
    masterBus.gain.value = 1.4;
    masterBus.connect(ctx.destination);
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
    // Прогрев: сразу начинаем загрузку всех сэмплов после первого жеста.
    void load('move');
    void load('capture');
    void load('checkmate');
    window.removeEventListener('pointerdown', fn);
    window.removeEventListener('keydown', fn);
    window.removeEventListener('touchstart', fn);
  };
  window.addEventListener('pointerdown', fn, { passive: true });
  window.addEventListener('keydown', fn);
  window.addEventListener('touchstart', fn, { passive: true });
}

async function load(name: SoundName): Promise<AudioBuffer | null> {
  if (buffers[name]) return buffers[name]!;
  if (inFlight[name]) return inFlight[name]!;
  const c = getCtx();
  if (!c) return null;
  const p = (async () => {
    try {
      const res = await fetch(URLS[name], { cache: 'force-cache' });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      // decodeAudioData в Safari возвращает старый callback-API — обернём в Promise.
      const buf: AudioBuffer = await new Promise((resolve, reject) => {
        try {
          const maybe = c.decodeAudioData(ab.slice(0), resolve, reject);
          if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
            (maybe as Promise<AudioBuffer>).then(resolve, reject);
          }
        } catch (e) {
          reject(e);
        }
      });
      buffers[name] = buf;
      return buf;
    } catch {
      return null;
    } finally {
      delete inFlight[name];
    }
  })();
  inFlight[name] = p;
  return p;
}

function play(name: SoundName): void {
  const c = getCtx();
  if (!c) return;
  const buf = buffers[name];
  if (!buf) {
    // Первый вызов — подгружаем и затем играем.
    void load(name).then((b) => {
      if (!b) return;
      playBuffer(b);
    });
    return;
  }
  playBuffer(buf);
}

function playBuffer(buf: AudioBuffer): void {
  const c = getCtx();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(masterBus ?? c.destination);
  try {
    src.start(0);
  } catch {
    // ignore — Safari иногда придирчив к повторному start.
  }
}

/** Звук обычного хода — настоящий сэмпл деревянной фигуры на доске. */
export function playMoveSound(): void {
  play('move');
}

/** Звук взятия — деревянный «двойной» удар. */
export function playCaptureSound(): void {
  play('capture');
}

/** Звук мата — характерный финальный сэмпл Lichess. */
export function playCheckmateSound(): void {
  play('checkmate');
}
