import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { JoinByInviteClient } from './JoinByInviteClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Приглашение в группу — gogachess' };

/**
 * Прямая ссылка-приглашение от учителя: /community/join/<inviteCode>.
 * Показываем карточку группы и кнопку «Вступить» — без заявки и одобрения.
 */
export default async function JoinByInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const group = await prisma.group.findUnique({
    where: { inviteCode: code },
    include: {
      owner: { select: { displayName: true } },
      _count: { select: { members: true } },
    },
  });
  if (!group) return notFound();

  const auth = await getCurrentUser();
  if (!auth) {
    redirect(`/login?next=${encodeURIComponent(`/community/join/${code}`)}`);
  }

  const alreadyMember = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: auth.sub } },
    select: { id: true },
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 pb-16 pt-16 sm:px-6">
        <div className="card !p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Приглашение в группу
          </p>
          <h1 className="mt-2 break-words font-display text-2xl font-semibold">{group.name}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {group.country}, {group.city} · {group._count.members}{' '}
            {group._count.members === 1 ? 'участник' : 'участников'} · админ:{' '}
            {group.owner.displayName}
          </p>
          {group.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-stone-600 dark:text-stone-300">
              {group.description}
            </p>
          )}

          <div className="mt-6">
            {alreadyMember ? (
              <Link href={`/community/${group.id}`} className="btn-primary text-sm">
                Вы уже в группе — открыть
              </Link>
            ) : (
              <JoinByInviteClient groupId={group.id} inviteCode={code} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
