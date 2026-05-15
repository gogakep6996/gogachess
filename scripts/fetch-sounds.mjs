// Скачивает три звуковых файла шахматной доски (тема Lichess Standard) в public/sounds.
// GPLv3, ассеты Lichess: https://github.com/lichess-org/lila/tree/master/public/sound
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const TARGET_DIR = path.join(process.cwd(), 'public', 'sounds');
fs.mkdirSync(TARGET_DIR, { recursive: true });

const FILES = [
  ['move.mp3', 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3'],
  ['capture.mp3', 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3'],
  ['checkmate.mp3', 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericNotify.mp3'],
];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

(async () => {
  for (const [name, url] of FILES) {
    const dest = path.join(TARGET_DIR, name);
    process.stdout.write(`fetch ${name} ... `);
    try {
      const buf = await get(url);
      fs.writeFileSync(dest, buf);
      console.log(`OK ${buf.length} B`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      process.exitCode = 1;
    }
  }
})();
