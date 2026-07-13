import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { FriendsClient } from './FriendsClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Друзья — gogachess' };

export default async function FriendsPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login?next=/friends');

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <FriendsClient />
      </main>
    </>
  );
}
