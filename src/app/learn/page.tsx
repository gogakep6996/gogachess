import { Header } from '@/components/layout/Header';
import { TRAINING_CATEGORIES, getPuzzleCount } from '@/lib/training';
import { LearnGrid } from './LearnGrid';

export const metadata = {
  title: 'Обучение — тактические задачи | gogachess',
};

export default function LearnPage() {
  const cats = TRAINING_CATEGORIES.map((c) => ({
    ...c,
    count: getPuzzleCount(c.id),
  }));
  const total = cats.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10">
        <section className="mb-8 text-center">
          <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
            Тактика
          </span>
          <h1 className="mt-3 font-display text-4xl font-semibold text-stone-800 dark:text-stone-100">
            Обучение
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-stone-600 dark:text-stone-400">
            {total} задач из реальных партий. Выберите тему — задачи выпадают
            случайно, после решения сразу появляется следующая.
          </p>
        </section>

        <LearnGrid categories={cats} />

        <p className="mt-10 text-center text-xs text-stone-400 dark:text-stone-500">
          Задачи — из открытой базы lichess.org (лицензия CC0). Прогресс
          сохраняется в этом браузере.
        </p>
      </main>
    </>
  );
}
