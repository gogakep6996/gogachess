import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { CommunityClient } from './CommunityClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Сообщество — gogachess',
  description:
    'Группы школ и клубов: создайте свою группу, приглашайте учеников, находите другие школы и договаривайтесь о совместных турнирах.',
};

export default async function CommunityPage() {
  const auth = await getCurrentUser();
  return (
    <>
      <Header />
      <main className="w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <CommunityClient meId={auth?.sub ?? null} />
      </main>
    </>
  );
}
