'use client';

import { useMemo, useState } from 'react';

function defaultStart(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  id: string;
  /** "scheduled" | "running" | "finished" */
  status: string;
}

/**
 * Управление турниром для организатора (внутри турнира): перезапустить
 * завершённый турнир на новое время. Удаление перенесено на список турниров
 * (крестик на карточке).
 */
export function OwnerControls({ id, status }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestart, setShowRestart] = useState(false);
  const initialStart = useMemo(() => defaultStart(), []);
  const [startsAt, setStartsAt] = useState<string>(initialStart);

  // Единственное действие здесь — перезапуск завершённого турнира.
  if (status !== 'finished') return null;

  async function handleRestart() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/tournaments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: new Date(startsAt).toISOString() }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error || 'Не удалось перезапустить турнир');
        return;
      }
      setShowRestart(false);
      // Полная перезагрузка: live-данные в клиенте обновляются по сокету, а REST
      // лишь подхватывает первое состояние — поэтому перечитываем страницу с нуля.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white/60 p-3 dark:border-stone-700 dark:bg-stone-900/40">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
        Управление (организатор)
      </div>

      {!showRestart ? (
        <button
          onClick={() => setShowRestart(true)}
          disabled={busy}
          className="btn-outline w-full text-xs"
        >
          Перезапустить на другое время
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Новый старт</span>
            <input
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button onClick={handleRestart} disabled={busy} className="btn-primary flex-1 text-xs">
              {busy ? 'Запуск…' : 'Перезапустить'}
            </button>
            <button
              onClick={() => setShowRestart(false)}
              disabled={busy}
              className="btn-ghost text-xs"
            >
              Отмена
            </button>
          </div>
          <p className="text-[11px] leading-snug text-stone-500">
            Партии, комнаты и список участников сбросятся — все зайдут заново.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
