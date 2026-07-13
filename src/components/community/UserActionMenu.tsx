'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ник пользователя, по клику — маленькое меню действий:
 * «Добавить в друзья» и «Написать сообщение». Используется в списках
 * участников группы, чате группы и т.п. Для самого себя меню не открывается.
 */
export function UserActionMenu({
  userId,
  name,
  meId,
  className,
}: {
  userId: string;
  name: string;
  meId: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const isSelf = meId === userId;

  async function addFriend() {
    if (busy || sent) return;
    setBusy(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (isSelf || !meId) {
    return <span className={className}>{name}</span>;
  }

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer underline-offset-2 hover:text-brand-600 hover:underline dark:hover:text-brand-400 ${className ?? ''}`}
        title={`Действия: ${name}`}
      >
        {name}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-40 mt-1 flex w-48 flex-col overflow-hidden rounded-xl border border-stone-200 bg-paper py-1 text-left shadow-xl dark:border-stone-700 dark:bg-stone-900">
          <button
            type="button"
            onClick={addFriend}
            disabled={busy || sent}
            className="px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-stone-100 disabled:opacity-60 dark:hover:bg-stone-800"
          >
            {sent ? '✓ Заявка отправлена' : busy ? 'Отправляем…' : '+ Добавить в друзья'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/messages?to=${userId}`);
            }}
            className="px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            ✉ Написать сообщение
          </button>
        </span>
      )}
    </span>
  );
}
