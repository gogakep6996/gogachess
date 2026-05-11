'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isPublic }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) {
        setError(data.error || 'Ошибка');
        return;
      }
      router.push(`/room/${data.code}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h2 className="font-display text-2xl">Создать комнату</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Название</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Урок 5: эндшпиль ладья + пешка"
        />
      </label>

      <div className="flex gap-2">
        <Toggle active={isPublic} onClick={() => setIsPublic(true)} label="Публичная" />
        <Toggle active={!isPublic} onClick={() => setIsPublic(false)} label="Закрытая" />
      </div>

      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Создаём…' : 'Создать и зайти'}
      </button>
    </form>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'btn flex-1 bg-brand-500 text-white shadow-soft'
          : 'btn flex-1 bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200'
      }
    >
      {label}
    </button>
  );
}
