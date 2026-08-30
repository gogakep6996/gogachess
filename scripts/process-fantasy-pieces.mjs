// Одноразовая подготовка спрайтов «Развлекательных шахмат».
// Генератор отдал PNG с «шахматным» серо-белым фоном вместо прозрачности, поэтому:
// 1) flood-fill от краёв убирает основной фон;
// 2) замкнутые области (внутри нимба, под тенями) проверяются на клетчатый
//    паттерн по сетке тайлов — совпало с шахматкой → тоже фон;
// 3) сглаживание альфы на границе → trim → 512px → WebP.
// Запуск: node scripts/process-fantasy-pieces.mjs
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const SRC_DIR = path.resolve('assets-src/fantasy-pieces'); // исходные PNG от генератора
const OUT_DIR = path.resolve('public/pieces/fantasy'); // готовые WebP для сайта
const CODES = ['wp', 'wr', 'wn', 'wb', 'wq', 'wk', 'bp', 'br', 'bn', 'bb', 'bq', 'bk'];

/** Пиксель похож на «шахматку»: почти нейтральный по цвету и светлый. */
function isBackgroundish(r, g, b, loose = false) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const grayish = maxC - minC <= (loose ? 18 : 12);
  const bright = minC >= (loose ? 160 : 185);
  return grayish && bright;
}

/** Шире: допускаем затенённую/подкрашенную шахматку (тени, свечения поверх фона). */
function isRegionish(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return maxC - minC <= 26 && minC >= 110;
}

/** Определяем размер тайла шахматки и фазу сетки по верхней кромке изображения. */
function detectGrid(data, W, C) {
  const y = 4;
  const boundaries = [];
  let prev = null;
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * C;
    const lum = (data[o] + data[o + 1] + data[o + 2]) / 3;
    if (prev !== null && Math.abs(lum - prev) > 8) boundaries.push(x);
    prev = lum;
  }
  if (boundaries.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < boundaries.length; i++) diffs.push(boundaries[i] - boundaries[i - 1]);
  // Мода расстояний между границами = размер тайла.
  const freq = new Map();
  for (const d of diffs) freq.set(d, (freq.get(d) ?? 0) + 1);
  let tile = 0;
  let best = 0;
  for (const [d, n] of freq) {
    if (n > best && d >= 4) {
      best = n;
      tile = d;
    }
  }
  if (!tile) return null;
  const phase = boundaries[0] % tile;
  return { tile, phase };
}

async function processOne(code) {
  const src = path.join(SRC_DIR, `${code}.png`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const grid = detectGrid(data, W, C);

  // --- Шаг 1: BFS от краёв — основной связный фон. ---
  const bg = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;
  const tryPush = (x, y, loose) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const idx = y * W + x;
    if (bg[idx]) return;
    const o = idx * C;
    if (!isBackgroundish(data[o], data[o + 1], data[o + 2], loose)) return;
    bg[idx] = 1;
    queue[qt++] = idx;
  };
  for (let x = 0; x < W; x++) {
    tryPush(x, 0, true);
    tryPush(x, H - 1, true);
  }
  for (let y = 0; y < H; y++) {
    tryPush(0, y, true);
    tryPush(W - 1, y, true);
  }
  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % W;
    const y = (idx / W) | 0;
    tryPush(x + 1, y, false);
    tryPush(x - 1, y, false);
    tryPush(x, y + 1, false);
    tryPush(x, y - 1, false);
  }

  // --- Шаг 2: замкнутые области — проверка на клетчатый паттерн. ---
  if (grid) {
    const { tile, phase } = grid;
    const visited = new Uint8Array(W * H);
    const rq = new Int32Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (bg[start] || visited[start]) continue;
      const so = start * C;
      if (!isRegionish(data[so], data[so + 1], data[so + 2])) continue;
      let h = 0;
      let t = 0;
      rq[t++] = start;
      visited[start] = 1;
      const region = [];
      while (h < t) {
        const idx = rq[h++];
        region.push(idx);
        const x = idx % W;
        const y = (idx / W) | 0;
        const nb = [
          x > 0 ? idx - 1 : -1,
          x < W - 1 ? idx + 1 : -1,
          y > 0 ? idx - W : -1,
          y < H - 1 ? idx + W : -1,
        ];
        for (const n of nb) {
          if (n < 0 || visited[n] || bg[n]) continue;
          const no = n * C;
          if (!isRegionish(data[no], data[no + 1], data[no + 2])) continue;
          visited[n] = 1;
          rq[t++] = n;
        }
      }
      if (region.length < 250) continue;

      // Шахматка = два узких пика яркости на расстоянии 10–30 (например, 237 и 254),
      // вместе покрывающие почти всю область. Однотонные блики дают один пик,
      // градиенты и рисованные детали — размазанную гистограмму.
      const hist = new Float64Array(256);
      for (const idx of region) {
        const o = idx * C;
        const lum = Math.round((data[o] + data[o + 1] + data[o + 2]) / 3);
        hist[lum] += 1;
      }
      const total = region.length;
      const shareAround = (p) => {
        let s = 0;
        for (let l = Math.max(0, p - 5); l <= Math.min(255, p + 5); l++) s += hist[l];
        return s / total;
      };
      let p1 = 0;
      for (let l = 1; l < 256; l++) if (hist[l] > hist[p1]) p1 = l;
      let p2 = -1;
      let p2v = 0;
      for (let l = 1; l < 256; l++) {
        if (Math.abs(l - p1) < 8) continue;
        if (hist[l] > p2v) {
          p2v = hist[l];
          p2 = l;
        }
      }
      if (p2 < 0) continue;
      const s1 = shareAround(p1);
      const s2 = shareAround(p2);
      const dist = Math.abs(p1 - p2);
      const isChecker = dist >= 10 && dist <= 30 && s1 >= 0.25 && s2 >= 0.2 && s1 + s2 >= 0.8;
      if (process.env.DEBUG_HOLES) {
        console.log(
          `  region ${code}: area=${region.length} p1=${p1}(${s1.toFixed(2)}) p2=${p2}(${s2.toFixed(2)}) -> ${isChecker ? 'FILL' : 'keep'}`,
        );
      }
      if (isChecker) {
        for (const idx of region) bg[idx] = 1;
      }
    }
  }

  // --- Шаг 3: расширение фона на полуфоновые пиксели границы (антиалиасинг). ---
  const extra = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (bg[idx]) continue;
      const o = idx * C;
      if (!isBackgroundish(data[o], data[o + 1], data[o + 2], true)) continue;
      const nbg =
        (x > 0 && bg[idx - 1]) ||
        (x < W - 1 && bg[idx + 1]) ||
        (y > 0 && bg[idx - W]) ||
        (y < H - 1 && bg[idx + W]);
      if (nbg) extra.push(idx);
    }
  }
  for (const idx of extra) bg[idx] = 1;

  // --- Применяем альфу. ---
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const o = idx * C;
      if (bg[idx]) {
        data[o + 3] = 0;
      } else {
        const nbgCount =
          ((x > 0 && bg[idx - 1]) ? 1 : 0) +
          ((x < W - 1 && bg[idx + 1]) ? 1 : 0) +
          ((y > 0 && bg[idx - W]) ? 1 : 0) +
          ((y < H - 1 && bg[idx + W]) ? 1 : 0);
        if (nbgCount > 0) data[o + 3] = nbgCount >= 2 ? 120 : 190;
      }
    }
  }

  const out = path.join(OUT_DIR, `${code}.webp`);
  await sharp(data, { raw: { width: W, height: H, channels: C } })
    .trim()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(out);
  const size = (await stat(out)).size;
  console.log(`${code}: tile=${grid ? grid.tile : '?'} -> ${Math.round(size / 1024)} KB`);
}

async function main() {
  for (const code of CODES) {
    await processOne(code);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
