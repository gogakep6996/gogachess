import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">Страница не найдена</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">404</p>
      <Link href="/" className="mt-6 inline-block text-brand-600 underline dark:text-brand-400">
        На главную
      </Link>
    </div>
  );
}
