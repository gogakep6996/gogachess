import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function LearnPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
          Скоро
        </span>
        <h1 className="mt-3 font-display text-4xl font-semibold">Обучение</h1>
        <p className="mx-auto mt-2 max-w-xl text-stone-600 dark:text-stone-400">
          Здесь появятся курсы, тактические задачи и упражнения для разных уровней.
          Раздел в разработке.
        </p>
        <Link href="/" className="btn-outline mt-6">
          На главную
        </Link>
      </main>
    </>
  );
}
