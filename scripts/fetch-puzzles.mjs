// Добор тактических задач из открытой базы Lichess (CC0) до целевых квот.
//
// Источник: датасет Lichess/chess-puzzles на Hugging Face (зеркало
// database.lichess.org). Скрипт читает случайные страницы по 100 строк,
// фильтрует по темам/качеству и дописывает результат в
// src/data/training-puzzles.json (существующие задачи сохраняются).
//
// Запуск:  node scripts/fetch-puzzles.mjs
// Требуется Node 18+ (глобальный fetch). Занимает ~2-4 минуты.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROWS_URL =
  'https://datasets-server.huggingface.co/rows?dataset=Lichess%2Fchess-puzzles&config=default&split=train';
const TOTAL_ROWS = 5_900_000; // в базе ~5.94 млн задач
const PAGE = 100;
const MAX_PAGES = 150;

// Сколько задач хотим в каждом блоке (всего ~500).
const TARGETS = {
  mate1: 80,
  mate2: 80,
  mate3: 60,
  endgame: 100,
  fork: 70,
  pin: 50,
  mix: 60,
};

// Потолок сложности по блокам, чтобы задачи были посильны ученикам.
const MAX_RATING = {
  mate1: 1500,
  mate2: 1800,
  mate3: 2200,
  endgame: 1900,
  fork: 1800,
  pin: 1900,
  mix: 1700,
};

const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'training-puzzles.json',
);

/** Определяем блок по темам Lichess. Порядок важен: маты приоритетнее. */
function classify(themes) {
  if (themes.includes('mateIn1')) return 'mate1';
  if (themes.includes('mateIn2')) return 'mate2';
  if (themes.includes('mateIn3')) return 'mate3';
  if (themes.includes('fork')) return 'fork';
  if (themes.includes('pin')) return 'pin';
  if (themes.includes('endgame')) return 'endgame';
  if (
    themes.includes('short') &&
    (themes.includes('advantage') || themes.includes('crushing'))
  )
    return 'mix';
  return null;
}

/** Ходы игрока — нечётные индексы (первый ход в решении делает соперник).
 *  Отбрасываем задачи, где игрок превращает пешку не в ферзя: доска в
 *  тренажёре превращает автоматически в ферзя. */
function hasOddPromotion(moves) {
  return moves.some((m, i) => i % 2 === 1 && m.length === 5 && m[4] !== 'q');
}

async function fetchPage(offset) {
  const res = await fetch(`${ROWS_URL}&offset=${offset}&length=${PAGE}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.rows.map((r) => r.row);
}

async function main() {
  const json = JSON.parse(readFileSync(outFile, 'utf8'));
  const buckets = json.puzzles;
  const seen = new Set();
  for (const cat of Object.keys(TARGETS)) {
    buckets[cat] ??= [];
    for (const p of buckets[cat]) seen.add(p.id);
  }

  const need = () =>
    Object.entries(TARGETS).reduce(
      (sum, [cat, t]) => sum + Math.max(0, t - buckets[cat].length),
      0,
    );

  console.log(`Сейчас в базе: ${seen.size} задач, нужно добрать ещё ~${need()}.`);

  let pages = 0;
  while (need() > 0 && pages < MAX_PAGES) {
    const offset = Math.floor(Math.random() * (TOTAL_ROWS - PAGE));
    pages++;
    let rows;
    try {
      rows = await fetchPage(offset);
    } catch (err) {
      console.warn(`  страница offset=${offset} не загрузилась (${err.message}), пропускаю`);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    let added = 0;
    for (const row of rows) {
      const themes = row.Themes ?? [];
      const cat = classify(themes);
      if (!cat) continue;
      if (buckets[cat].length >= TARGETS[cat]) continue;
      if (seen.has(row.PuzzleId)) continue;
      if (row.Popularity < 85 || row.NbPlays < 200) continue;
      if (row.Rating > MAX_RATING[cat]) continue;
      const moves = row.Moves.split(' ');
      if (moves.length < 2 || hasOddPromotion(moves)) continue;

      buckets[cat].push({
        id: row.PuzzleId,
        fen: row.FEN,
        moves: row.Moves,
        rating: row.Rating,
      });
      seen.add(row.PuzzleId);
      added++;
    }

    const left = need();
    console.log(`  стр. ${pages} (offset=${offset}): +${added}, осталось добрать ${left}`);
    await new Promise((r) => setTimeout(r, 400)); // бережём API
  }

  for (const cat of Object.keys(TARGETS)) {
    buckets[cat].sort((a, b) => a.rating - b.rating);
  }

  writeFileSync(outFile, JSON.stringify(json, null, 2) + '\n', 'utf8');

  const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
  console.log('\nГотово! Задач по блокам:');
  for (const [cat, arr] of Object.entries(buckets)) {
    console.log(`  ${cat.padEnd(8)} ${arr.length}`);
  }
  console.log(`  всего    ${total}`);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
