'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_CONTROLS } from '@/lib/socket-events';

function defaultStart(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateTournamentForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [timeControl, setTimeControl] = useState<string>('blitz-5+0');
  const [durationMin, setDurationMin] = useState(45);
  const initialStart = useMemo(() => defaultStart(), []);
  const [startsAt, setStartsAt] = useState<string>(initialStart);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          timeControl,
          durationMin,
          startsAt: new Date(startsAt).toISOString(),
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error || 'Ошибка');
        return;
      }
      router.push(`/tournaments/${data.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h2 className="font-display text-2xl">Создать турнир</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Название</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Воскресный блиц"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Контроль времени</span>
        <select
          className="input"
          value={timeControl}
          onChange={(e) => setTimeControl(e.target.value)}
        >
          {TIME_CONTROLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Длительность, мин</span>
          <input
            type="number"
            min={5}
            max={360}
            className="input"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Старт</span>
          <input
            type="datetime-local"
            className="input"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Создаём…' : 'Создать турнир'}
      </button>

      <p className="text-xs text-stone-500">
        Когда наступит время старта, сервер начнёт автоматически сводить свободных участников в пары.
        Очки: победа — 1, ничья — 0.5, поражение — 0.
      </p>
    </form>
  );
}
