import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const target = join(root, 'public', 'engine');

const require = createRequire(import.meta.url);
let pkgEntry;
try {
  pkgEntry = require.resolve('stockfish/package.json');
} catch {
  console.warn('[stockfish] пакет не установлен — пропускаю копирование');
  process.exit(0);
}

const stockfishDir = dirname(pkgEntry);

// Stockfish 18: готовые сборки лежат в bin/. Берём ТОЛЬКО одноядерную lite-сборку
// (~7 МБ): работает без COOP/COEP-заголовков и приемлема по весу для браузера.
// Большая сборка (stockfish-18-single.wasm) весит ~112 МБ — намеренно НЕ копируем.
const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

mkdirSync(target, { recursive: true });

let count = 0;
for (const name of FILES) {
  const from = join(stockfishDir, 'bin', name);
  if (!existsSync(from)) {
    console.warn(`[stockfish] не найден ${name} в bin/ — пропускаю`);
    continue;
  }
  copyFileSync(from, join(target, name));
  count++;
}

if (count > 0) {
  console.log(`[stockfish] скопировано ${count} файлов в /public/engine`);
} else {
  console.warn('[stockfish] ничего не скопировано — движок будет грузиться с CDN (fallback)');
}
