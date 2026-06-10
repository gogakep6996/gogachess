'use client';

/** Прогресс тренажёра задач хранится локально в браузере (без аккаунта). */

const PROGRESS_KEY = 'gogachess-training-progress-v1';
const BEST_STREAK_KEY = 'gogachess-training-best-streak';

type ProgressMap = Record<string, string[]>;

function readProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getSolvedIds(categoryId: string): string[] {
  return readProgress()[categoryId] ?? [];
}

export function addSolved(categoryId: string, puzzleId: string): number {
  const map = readProgress();
  const list = map[categoryId] ?? [];
  if (!list.includes(puzzleId)) {
    map[categoryId] = [...list, puzzleId];
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch {
      // localStorage может быть недоступен (приватный режим) — не критично
    }
  }
  return map[categoryId]?.length ?? list.length;
}

export function getBestStreak(): number {
  try {
    return Number(localStorage.getItem(BEST_STREAK_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBestStreak(streak: number): void {
  try {
    if (streak > getBestStreak()) {
      localStorage.setItem(BEST_STREAK_KEY, String(streak));
    }
  } catch {
    // ignore
  }
}
