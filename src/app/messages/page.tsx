import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { MessagesClient } from './MessagesClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Сообщения — gogachess' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/messages');
  const { to } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <MessagesClient meId={auth.sub} initialPeerId={to ?? null} />
      </main>
    </>
  );
}
