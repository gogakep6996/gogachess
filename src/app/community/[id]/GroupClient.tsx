'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserActionMenu } from '@/components/community/UserActionMenu';
import { TIME_CONTROLS } from '@/lib/socket-events';

interface GroupInfo {
  id: string;
  name: string;
  country: string;
  city: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  membersCount: number;
}

interface MemberDto {
  userId: string;
  name: string;
  role: string;
  joinedAt: string;
}

interface RequestDto {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface TournamentDto {
  id: string;
  name: string;
  timeControl: string;
  durationMin: number;
  startsAt: string;
  status: string;
  players: number;
}

interface ChatMsg {
  id: string;
  userId: string;
  name: string;
  content: string;
  createdAt: string;
}

interface GroupResponse {
  group: GroupInfo;
  myRole: string | null;
  myRequestStatus: string | null;
  inviteCode: string | null;
  members: MemberDto[];
  requests: RequestDto[];
  tournaments: TournamentDto[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Страница группы в стиле lichess-клуба: слева компактная колонка
 * (чат + участники), справа — описание и турниры. Всё видно сразу,
 * без вкладок — страница не «прыгает» при переключении.
 */
export function GroupClient({ groupId, meId }: { groupId: string; meId: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<GroupResponse | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Окошко заявок (маленькая кнопка в шапке у админа).
  const [requestsOpen, setRequestsOpen] = useState(false);
  const requestsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!requestsOpen) return;
    function onDown(e: MouseEvent) {
      if (requestsRef.current && !requestsRef.current.contains(e.target as Node)) {
        setRequestsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setRequestsOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [requestsOpen]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/community/groups/${groupId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const d = (await res.json()) as GroupResponse;
    setData(d);
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMember = Boolean(data?.myRole);
  const isAdmin = data?.myRole === 'admin' || data?.group.ownerId === meId;

  // ---------- Чат группы (поллинг, только участникам) ----------
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(async () => {
    const res = await fetch(`/api/community/groups/${groupId}/messages`, { cache: 'no-store' });
    if (!res.ok) return;
    const d = (await res.json()) as { messages: ChatMsg[] };
    setMessages(d.messages);
  }, [groupId]);

  useEffect(() => {
    if (!isMember) return;
    void loadChat();
    const t = setInterval(() => void loadChat(), 5000);
    return () => clearInterval(t);
  }, [isMember, loadChat]);

  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    setChatInput('');
    const res = await fetch(`/api/community/groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const d = (await res.json()) as { message: ChatMsg };
      setMessages((m) => [...m, d.message]);
    }
  }

  // ---------- Вступление / выход / заявки ----------
  async function requestJoin() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/community/groups/${groupId}/join`, { method: 'POST' });
      if (res.ok) await load();
    } finally {
      setActionBusy(false);
    }
  }

  async function leaveGroup() {
    if (actionBusy) return;
    if (!window.confirm('Покинуть группу?')) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/community/groups/${groupId}/leave`, { method: 'POST' });
      if (res.ok) await load();
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteGroup() {
    if (actionBusy) return;
    if (!window.confirm('Удалить группу навсегда? Участники и чат будут удалены.')) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/community/groups/${groupId}`, { method: 'DELETE' });
      if (res.ok) router.push('/community');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRequest(requestId: string, action: 'approve' | 'reject') {
    const res = await fetch(`/api/community/groups/${groupId}/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    });
    if (res.ok) await load();
  }

  function copyInvite() {
    if (!data?.inviteCode) return;
    const url = `${window.location.origin}/community/join/${data.inviteCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      setNotice('Ссылка-приглашение скопирована. Отправьте её ученикам.');
      setTimeout(() => setNotice(null), 4000);
    });
  }

  // ---------- Описание (редактирует админ) ----------
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  async function saveDescription() {
    const res = await fetch(`/api/community/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: descDraft }),
    });
    if (res.ok) {
      setEditingDesc(false);
      await load();
    }
  }

  // ---------- Создание турнира группы (админ) ----------
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [tForm, setTForm] = useState({
    name: '',
    timeControl: 'blitz-5+0',
    durationMin: 60,
    startsAt: '',
  });
  const [tError, setTError] = useState<string | null>(null);

  async function createTournament(e: React.FormEvent) {
    e.preventDefault();
    setTError(null);
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: tForm.name || `Турнир — ${data?.group.name ?? ''}`,
        timeControl: tForm.timeControl,
        durationMin: tForm.durationMin,
        startsAt: new Date(tForm.startsAt).toISOString(),
        groupId,
      }),
    });
    const d = (await res.json()) as { id?: string; error?: string };
    if (res.ok && d.id) {
      setCreatingTournament(false);
      setTForm({ name: '', timeControl: 'blitz-5+0', durationMin: 60, startsAt: '' });
      await load();
    } else {
      setTError(d.error || 'Не удалось создать турнир');
    }
  }

  if (!data) {
    return <p className="py-16 text-center text-sm text-stone-400">Загружаем группу…</p>;
  }

  const g = data.group;
  const upcoming = data.tournaments.filter((t) => t.status !== 'finished');
  const finished = data.tournaments.filter((t) => t.status === 'finished');
  const showWriteAdmin = Boolean(meId) && meId !== g.ownerId;

  return (
    <div>
      {/* Шапка: название + действия. Компактно, без лишних отступов. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/community"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-300/70 px-3 py-2 text-xs font-semibold text-stone-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12.5 4L6.5 10l6 6" />
            </svg>
            Все группы
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold leading-tight">
              {g.name}
            </h1>
            <p className="break-words text-xs text-stone-500 dark:text-stone-400">
              {g.country}, {g.city} · {g.membersCount}{' '}
              {g.membersCount === 1 ? 'участник' : 'участников'} · админ:{' '}
              <UserActionMenu userId={g.ownerId} name={g.ownerName} meId={meId} className="font-medium" />
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!meId ? (
            <Link href={`/login?next=/community/${g.id}`} className="btn-primary text-xs">
              Войти, чтобы вступить
            </Link>
          ) : isAdmin ? (
            <>
              <button onClick={copyInvite} className="btn-primary !py-1.5 text-xs">
                🔗 Ссылка-приглашение
              </button>

              {/* Заявки: маленькая кнопка, по клику — небольшое окошко со списком. */}
              <div ref={requestsRef} className="relative">
                <button
                  onClick={() => setRequestsOpen((v) => !v)}
                  className="btn-outline relative !py-1.5 text-xs"
                >
                  Заявки
                  {data.requests.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {data.requests.length}
                    </span>
                  )}
                </button>
                {requestsOpen && (
                  <div className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-2xl border border-stone-200 bg-paper p-3 shadow-xl dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="text-xs font-semibold">Заявки на вступление</h3>
                      <button
                        onClick={() => setRequestsOpen(false)}
                        className="btn-ghost !px-1.5 !py-0 text-sm leading-none text-stone-400"
                        aria-label="Закрыть"
                      >
                        ✕
                      </button>
                    </div>
                    {data.requests.length === 0 ? (
                      <p className="py-3 text-center text-xs text-stone-400">Новых заявок нет.</p>
                    ) : (
                      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-0.5">
                        {data.requests.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-xl border border-stone-200/70 px-2.5 py-2 dark:border-stone-700/60"
                          >
                            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                              <span className="truncate text-xs font-medium">{r.name}</span>
                              <span className="shrink-0 text-[10px] text-stone-400">
                                {fmtDate(r.createdAt)}
                              </span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleRequest(r.id, 'approve')}
                                className="btn-primary flex-1 !py-1 text-[11px]"
                              >
                                Принять
                              </button>
                              <button
                                onClick={() => handleRequest(r.id, 'reject')}
                                className="btn-outline flex-1 !py-1 text-[11px]"
                              >
                                Отклонить
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={deleteGroup}
                disabled={actionBusy}
                className="btn-outline !py-1.5 !text-red-600 text-xs"
              >
                Удалить группу
              </button>
            </>
          ) : (
            <>
              {!isMember &&
                (data.myRequestStatus === 'pending' ? (
                  <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                    Заявка отправлена
                  </span>
                ) : (
                  <button
                    onClick={requestJoin}
                    disabled={actionBusy}
                    className="btn-primary !py-1.5 text-xs"
                  >
                    Подать заявку
                  </button>
                ))}
              {showWriteAdmin && (
                <Link href={`/messages?to=${g.ownerId}`} className="btn-outline !py-1.5 text-xs">
                  ✉ Написать админу
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {/* Две колонки как на lichess: слева чат + участники, справа контент. */}
      <div className="grid items-start gap-4 lg:grid-cols-[19rem_1fr]">
        {/* ===== Левая колонка ===== */}
        {/* min-w-0 обязателен: без него грид-колонка не даёт содержимому
            ужиматься, и длинное слово распирает всю страницу. */}
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          {/* Чат */}
          <div className="card flex h-72 flex-col !p-2.5">
            <div className="mb-1.5 flex shrink-0 items-center justify-between px-0.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Чат группы
              </h3>
            </div>
            {isMember ? (
              <>
                <div ref={chatBoxRef} className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {messages.length === 0 ? (
                    <p className="pt-8 text-center text-xs text-stone-400">
                      Пока пусто. Напишите первое сообщение!
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="break-words text-xs leading-relaxed">
                        <UserActionMenu
                          userId={m.userId}
                          name={m.name}
                          meId={meId}
                          className="font-semibold"
                        />
                        <span className="ml-1 break-words text-stone-700 dark:text-stone-200">
                          {m.content}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendChat} className="mt-1.5 flex shrink-0 gap-1">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Сообщение…"
                    className="input flex-1 !px-2.5 !py-1.5 text-xs"
                    maxLength={1000}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="btn-primary !px-2.5 !py-1.5 text-xs"
                  >
                    ➤
                  </button>
                </form>
              </>
            ) : (
              <p className="m-auto px-3 text-center text-xs leading-relaxed text-stone-400">
                Чат доступен участникам группы.
              </p>
            )}
          </div>

          {/* Участники — видны сразу */}
          <div className="card !p-2.5">
            <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Участники ({data.members.length})
            </h3>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {data.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-[10px] font-semibold text-white">
                      {m.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <UserActionMenu
                      userId={m.userId}
                      name={m.name}
                      meId={meId}
                      className="truncate text-xs font-medium"
                    />
                  </div>
                  {m.role === 'admin' && (
                    <span className="badge shrink-0 !px-1.5 !text-[9px] bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                      админ
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {isMember && !isAdmin && (
              <button
                onClick={leaveGroup}
                disabled={actionBusy}
                className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Покинуть группу
              </button>
            )}
          </div>
        </div>

        {/* ===== Правая колонка ===== */}
        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          {/* Описание — приветственный блок как на lichess (в фирменном кремовом фоне сайта) */}
          <div className="card !p-3.5">
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="input min-h-[80px] w-full resize-y text-sm"
                  maxLength={2000}
                  placeholder="Описание группы…"
                />
                <div className="flex gap-2">
                  <button onClick={saveDescription} className="btn-primary !py-1.5 text-xs">
                    Сохранить
                  </button>
                  <button onClick={() => setEditingDesc(false)} className="btn-outline !py-1.5 text-xs">
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {g.description || (
                    <span className="italic text-stone-400">
                      {isAdmin
                        ? 'Описания пока нет — добавьте приветствие для участников.'
                        : 'Описания пока нет.'}
                    </span>
                  )}
                </p>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setDescDraft(g.description ?? '');
                      setEditingDesc(true);
                    }}
                    className="btn-ghost shrink-0 !py-1 text-xs text-stone-500"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Турниры */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-brand-600 dark:text-brand-400">
                Турниры
              </h2>
              {isAdmin && !creatingTournament && (
                <button onClick={() => setCreatingTournament(true)} className="btn-primary !py-1.5 text-xs">
                  + Создать турнир
                </button>
              )}
            </div>

            {creatingTournament && (
              <form onSubmit={createTournament} className="card mb-3 space-y-2.5 !p-3.5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Название</span>
                    <input
                      value={tForm.name}
                      onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={`Турнир — ${g.name}`}
                      className="input w-full !py-1.5 text-sm"
                      maxLength={80}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Контроль времени</span>
                    <select
                      value={tForm.timeControl}
                      onChange={(e) => setTForm((f) => ({ ...f, timeControl: e.target.value }))}
                      className="input w-full !py-1.5 text-sm"
                    >
                      {TIME_CONTROLS.map((tc) => (
                        <option key={tc.id} value={tc.id}>
                          {tc.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Длительность (мин)</span>
                    <input
                      type="number"
                      min={5}
                      max={360}
                      value={tForm.durationMin}
                      onChange={(e) =>
                        setTForm((f) => ({ ...f, durationMin: Number(e.target.value) || 60 }))
                      }
                      className="input w-full !py-1.5 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Старт</span>
                    <input
                      type="datetime-local"
                      required
                      value={tForm.startsAt}
                      onChange={(e) => setTForm((f) => ({ ...f, startsAt: e.target.value }))}
                      className="input w-full !py-1.5 text-sm"
                    />
                  </label>
                </div>
                {tError && <p className="text-xs text-red-600 dark:text-red-400">{tError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary !py-1.5 text-xs">
                    Создать
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingTournament(false)}
                    className="btn-outline !py-1.5 text-xs"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}

            {data.tournaments.length === 0 && !creatingTournament ? (
              <div className="card !p-4 text-center text-xs text-stone-400">
                Турниров пока нет.
                {isAdmin && ' Создайте первый — он появится здесь в анонсе.'}
              </div>
            ) : (
              <div className="card divide-y divide-stone-200/70 !p-0 dark:divide-stone-700/50">
                {[...upcoming, ...finished].map((t) => (
                  <Link
                    key={t.id}
                    href={`/tournaments/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="text-[11px] text-stone-400">
                        {fmtDate(t.startsAt)} · {t.durationMin} мин
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                          <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                        </svg>
                        {t.players}
                      </span>
                      <span
                        className={`badge ${
                          t.status === 'running'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : t.status === 'scheduled'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                              : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                        }`}
                      >
                        {t.status === 'running' ? 'идёт' : t.status === 'scheduled' ? 'скоро' : 'завершён'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
