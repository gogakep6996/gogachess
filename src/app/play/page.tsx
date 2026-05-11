import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { PlayClient } from './PlayClient';

export default async function PlayPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/play');
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl font-semibold">Играть онлайн</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Выберите контроль времени — мы найдём свободного соперника и откроем партию.
          </p>
        </header>
        <PlayClient meName={auth.name} />
      </main>
    </>
  );
}
