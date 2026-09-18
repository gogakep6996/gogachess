'use client';

// Удаление своего турнира прямо из списка: иначе закончившиеся арены копятся,
// и найти нужную становится трудно. Спрашиваем подтверждение — вместе с
// турниром уходят его партии и таблица результатов.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash, X } from '@phosphor-icons/react';

import { IconButton } from '@/components/room/ui';

export function DeleteArenaButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/arenas/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setBusy(false);
    setConfirming(false);
    if (res?.ok) {
      router.refresh();
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? 'Не удалось удалить турнир');
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={() => setError(null)}
        className="max-w-[14rem] truncate rounded-lg bg-red-50 px-2 py-1 text-left text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
      >
        {error}
      </button>
    );
  }

  if (!confirming) {
    return (
      <IconButton
        icon={Trash}
        label={`Удалить турнир «${name}»`}
        onClick={() => setConfirming(true)}
      />
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="hidden text-[11px] font-medium text-stone-500 sm:inline dark:text-stone-400">
        Удалить?
      </span>
      <IconButton icon={X} label="Не удалять" onClick={() => setConfirming(false)} disabled={busy} />
      <IconButton
        icon={Trash}
        tone="danger"
        label={`Да, удалить турнир «${name}»`}
        onClick={remove}
        disabled={busy}
      />
    </span>
  );
}
