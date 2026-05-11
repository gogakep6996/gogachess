'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function JoinButton({ id, initiallyJoined }: { id: string; initiallyJoined: boolean }) {
  const router = useRouter();
  const [joined, setJoined] = useState(initiallyJoined);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const url = joined ? `/api/tournaments/${id}/leave` : `/api/tournaments/${id}/join`;
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      setJoined(!joined);
      startTransition(() => router.refresh());
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={joined ? 'btn-ghost text-xs' : 'btn-primary text-xs'}
    >
      {joined ? 'Я в игре · отменить' : 'Участвовать'}
    </button>
  );
}
