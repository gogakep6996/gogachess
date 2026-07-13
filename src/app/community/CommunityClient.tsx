'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface GroupDto {
  id: string;
  name: string;
  country: string;
  city: string;
  ownerId: string;
  ownerName: string;
  members: number;
  createdAt: string;
  myRole: string | null;
  requestPending: boolean;
}

/**
 * Сообщество: список групп с фильтрами (страна/город/поиск) и создание своей
 * группы. Учитель создаёт группу школы, ученики находят её и подают заявку.
 */
export function CommunityClient({ meId }: { meId: string | null }) {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupDto[] | null>(null);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');

  // Создание группы.
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', country: '', city: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: { q: string; country: string; city: string }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.country) sp.set('country', params.country);
    if (params.city) sp.set('city', params.city);
    const res = await fetch(`/api/community/groups?${sp.toString()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { groups: GroupDto[] };
    setGroups(data.groups);
  }, []);

  useEffect(() => {
    void load({ q: '', country: '', city: '' });
  }, [load]);

  // Дебаунс фильтров — не дёргаем API на каждый символ.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load({ q, country, city }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, country, city, load]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/community/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (res.ok && data.id) {
        router.push(`/community/${data.id}`);
      } else {
        setError(data.error || 'Не удалось создать группу');
      }
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  // Своя группа (где я админ) — для быстрой кнопки, чтобы не искать себя в списке.
  const myGroup = groups?.find((g) => g.myRole === 'admin') ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Сообщество</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Группы школ и клубов: найдите свою или создайте новую и пригласите учеников.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {myGroup && (
            <Link href={`/community/${myGroup.id}`} className="btn-outline text-sm">
              ★ Моя группа
            </Link>
          )}
          {meId ? (
            <button onClick={() => setCreating((v) => !v)} className="btn-primary text-sm">
              {creating ? 'Отмена' : '+ Создать группу'}
            </button>
          ) : (
            <Link href="/login?next=/community" className="btn-primary text-sm">
              Войти, чтобы создать группу
            </Link>
          )}
        </div>
      </div>

      {creating && (
        <form onSubmit={createGroup} className="card mb-6 space-y-3 !p-4">
          <h2 className="text-base font-semibold">Новая группа</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                Название
              </span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Школа №29"
                className="input w-full text-sm"
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                Страна
              </span>
              <input
                required
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="Россия"
                className="input w-full text-sm"
                maxLength={56}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                Город
              </span>
              <input
                required
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Москва"
                className="input w-full text-sm"
                maxLength={56}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
              Описание (необязательно)
            </span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Пара слов о группе: кто вы, как проходят занятия…"
              className="input min-h-[70px] w-full resize-y text-sm"
              maxLength={2000}
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary text-sm">
            {busy ? 'Создаём…' : 'Создать группу'}
          </button>
        </form>
      )}

      {/* Фильтры */}
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию…"
          className="input text-sm"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Страна"
          className="input text-sm"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Город"
          className="input text-sm"
        />
      </div>

      {/* Список групп */}
      {groups === null ? (
        <p className="py-10 text-center text-sm text-stone-400">Загружаем группы…</p>
      ) : groups.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Пока нет групп по этим фильтрам. Создайте первую!
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/community/${g.id}`}
                className="card group flex h-full flex-col !p-4 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words text-base font-semibold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400">
                    {g.name}
                  </h3>
                  {g.myRole === 'admin' ? (
                    <span className="badge shrink-0 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                      Моя группа
                    </span>
                  ) : g.myRole ? (
                    <span className="badge shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                      Участник
                    </span>
                  ) : g.requestPending ? (
                    <span className="badge shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                      Заявка отправлена
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {g.country}, {g.city}
                </p>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-stone-500 dark:text-stone-400">
                  <span>
                    Админ: <span className="font-medium text-stone-700 dark:text-stone-300">{g.ownerName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                    {g.members}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
