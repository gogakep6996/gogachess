import puzzlesData from '@/data/training-puzzles.json';

/** Задача из базы Lichess (CC0).
 *  ВАЖНО: fen — позиция ДО хода соперника. Первый ход в `moves` делает
 *  соперник (тренажёр воспроизводит его автоматически), дальше ходы
 *  чередуются: игрок, соперник, игрок… */
export interface TrainingPuzzle {
  id: string;
  fen: string;
  /** Решение в UCI через пробел: "e6f5 g4d1". */
  moves: string;
  rating: number;
}

export interface TrainingCategory {
  id: string;
  title: string;
  /** Короткое описание для карточки. */
  desc: string;
  icon: string;
  tone: string;
}

export const TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    id: 'mate1',
    title: 'Мат в 1 ход',
    desc: 'Найдите ход, который сразу ставит мат.',
    icon: '♛',
    tone: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  },
  {
    id: 'mate2',
    title: 'Мат в 2 хода',
    desc: 'Форсированный мат: ваш ход, ответ соперника — и мат.',
    icon: '♜',
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  },
  {
    id: 'mate3',
    title: 'Мат в 3 хода',
    desc: 'Длинные матовые комбинации для сильных игроков.',
    icon: '♚',
    tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  },
  {
    id: 'endgame',
    title: 'Эндшпиль',
    desc: 'Точная игра в окончаниях: пешечные, ладейные и другие.',
    icon: '♟',
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  {
    id: 'fork',
    title: 'Вилка',
    desc: 'Двойной удар: одна фигура атакует сразу две цели.',
    icon: '♞',
    tone: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  },
  {
    id: 'pin',
    title: 'Связка',
    desc: 'Используйте связанные фигуры соперника.',
    icon: '♝',
    tone: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
  },
  {
    id: 'mix',
    title: 'Смешанная тактика',
    desc: 'Задачи на разные темы — как в настоящей партии.',
    icon: '⚡',
    tone: 'bg-stone-200 text-stone-700 dark:bg-stone-700/60 dark:text-stone-200',
  },
];

const PUZZLES = puzzlesData.puzzles as Record<string, TrainingPuzzle[]>;

export function getCategory(id: string): TrainingCategory | undefined {
  return TRAINING_CATEGORIES.find((c) => c.id === id);
}

export function getPuzzleCount(categoryId: string): number {
  return PUZZLES[categoryId]?.length ?? 0;
}

/** Случайная задача из блока; excludeId — текущая, чтобы не выпала повторно. */
export function getRandomPuzzle(
  categoryId: string,
  excludeId?: string | null,
): TrainingPuzzle | null {
  const pool = PUZZLES[categoryId];
  if (!pool || pool.length === 0) return null;
  const candidates =
    pool.length > 1 && excludeId ? pool.filter((p) => p.id !== excludeId) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
