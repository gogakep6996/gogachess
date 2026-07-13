'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Кнопка «Вступить в группу» по инвайт-коду — вступление без заявки. */
export function JoinByInviteClient({
  groupId,
  inviteCode,
}: {
  groupId: string;
  inviteCode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/groups/${groupId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        router.push(`/community/${groupId}`);
      } else {
        setError(data.error || 'Не удалось вступить в группу');
      }
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={join} disabled={busy} className="btn-primary text-sm">
        {busy ? 'Вступаем…' : 'Вступить в группу'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
