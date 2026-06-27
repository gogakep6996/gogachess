'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Крестик удаления турнира на карточке списка — виден только организатору. */
export function DeleteTournamentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        `Удалить турнир «${name}»? Все партии и результаты будут удалены безвозвратно.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        alert(j.error || 'Не удалось удалить турнир');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      title="Удалить турнир"
      aria-label="Удалить турнир"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-300 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
    >
      ✕
    </button>
  );
}
