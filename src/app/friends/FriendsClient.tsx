'use client';

import { useCallback, useEffect, useState } from 'react';

interface FriendDto {
  id: string;
  userId: string;
  name: string;
}

interface RequestDto {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface FriendsResponse {
  friends: FriendDto[];
  incoming: RequestDto[];
  outgoing: RequestDto[];
}

/**
 * Друзья: входящие заявки (принять/отклонить), список друзей
 * (написать сообщение / удалить) и исходящие заявки (отменить).
 */
export function FriendsClient() {
  const [data, setData] = useState<FriendsResponse | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/friends', { cache: 'no-store' });
    if (!res.ok) return;
    setData((await res.json()) as FriendsResponse);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(id: string, action: 'accept' | 'reject') {
    const res = await fetch(`/api/friends/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) await load();
  }

  async function remove(id: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    const res = await fetch(`/api/friends/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  if (!data) {
    return <p className="py-16 text-center text-sm text-stone-400">Загружаем…</p>;
  }

  return (
    <div>
      <h1 className="mb-5 font-display text-3xl font-semibold">Друзья</h1>

      {/* Входящие заявки */}
      {data.incoming.length > 0 && (
        <div className="card mb-4 !p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Заявки в друзья
            <span className="ml-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {data.incoming.length}
            </span>
          </h2>
          <ul className="divide-y divide-stone-200/70 dark:divide-stone-700/50">
            {data.incoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.name} />
                  <div>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-[11px] text-stone-400">
                      хочет добавить вас в друзья
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => respond(r.id, 'accept')} className="btn-primary !py-1.5 text-xs">
                    Принять
                  </button>
                  <button onClick={() => respond(r.id, 'reject')} className="btn-outline !py-1.5 text-xs">
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Список друзей */}
      <div className="card mb-4 !p-4">
        <h2 className="mb-2 text-sm font-semibold">Мои друзья ({data.friends.length})</h2>
        {data.friends.length === 0 ? (
          <p className="py-6 text-center text-sm leading-relaxed text-stone-400">
            Пока нет друзей.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200/70 dark:divide-stone-700/50">
            {data.friends.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={f.name} />
                  <span className="text-sm font-medium">{f.name}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => remove(f.id, `Удалить ${f.name} из друзей?`)}
                    className="btn-ghost !py-1.5 text-xs text-stone-400 hover:text-red-600"
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Исходящие заявки */}
      {data.outgoing.length > 0 && (
        <div className="card !p-4">
          <h2 className="mb-2 text-sm font-semibold">Отправленные заявки</h2>
          <ul className="divide-y divide-stone-200/70 dark:divide-stone-700/50">
            {data.outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.name} />
                  <div>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-[11px] text-stone-400">ожидает ответа</div>
                  </div>
                </div>
                <button
                  onClick={() => remove(r.id, 'Отменить заявку?')}
                  className="btn-ghost !py-1.5 text-xs text-stone-400 hover:text-red-600"
                >
                  Отменить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-semibold text-white">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
