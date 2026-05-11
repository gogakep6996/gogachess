import { mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
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
const srcDir = join(stockfishDir, 'src');
if (!existsSync(srcDir)) {
  console.warn('[stockfish] не найдено src/, пропускаю');
  process.exit(0);
}

mkdirSync(target, { recursive: true });

let count = 0;
function copyDir(from, to) {
  for (const entry of readdirSync(from)) {
    const s = join(from, entry);
    const d = join(to, entry);
    const stat = statSync(s);
    if (stat.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      copyFileSync(s, d);
      count++;
    }
  }
}
copyDir(srcDir, target);
console.log(`[stockfish] скопировано ${count} файлов в /public/engine`);
