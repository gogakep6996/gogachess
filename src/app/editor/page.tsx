import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';

import { Header } from '@/components/layout/Header';

import { EditorClient } from './EditorClient';

export const metadata = {
  title: 'Редактор доски — gogachess',
  description: 'Соберите позицию и получите FEN, чтобы начать турнир не с начальной позиции.',
};

export default function EditorPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-6 pt-4 sm:px-6">
        {/* Шапка в одну строку: страница начинается выше, доска помещается в экран. */}
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <Link
            href="/tournaments"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-300"
          >
            <ArrowLeft size={12} weight="bold" aria-hidden />
            Турниры
          </Link>
          <h1 className="font-display text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Редактор доски
          </h1>
          <p className="text-[12.5px] leading-snug text-stone-500 dark:text-stone-400">
            Расставьте фигуры — под доской появится FEN для поля «Начальная позиция» при
            создании турнира.
          </p>
        </div>

        {/* useSearchParams требует границы Suspense при статическом рендере. */}
        <Suspense fallback={null}>
          <EditorClient />
        </Suspense>
      </main>
    </>
  );
}
