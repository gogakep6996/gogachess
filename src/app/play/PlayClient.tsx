'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { SocketEvents, TIME_CONTROLS, timeControlLabel, type MatchFoundPayload } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'searching' | 'found';
type InviteState =
  | { mode: 'closed' }
  | { mode: 'picking'; timeControl: string }
  | { mode: 'creating'; timeControl: string }
  | { mode: 'created'; timeControl: string; code: string };

export function PlayClient({ meName: _meName }: { meName: string }) {
  void _meName;
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [opponent, setOpponent] = useState<string | null>(null);
  const [waitSec, setWaitSec] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  // Приглашение друга
  const [invite, setInvite] = useState<InviteState>({ mode: 'closed' });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = s;
    s.on(SocketEvents.MatchSearching, () => setStatus('searching'));
    s.on(SocketEvents.MatchFound, (payload: MatchFoundPayload) => {
      setStatus('found');
      setOpponent(payload.opponentName);
      setTimeout(() => router.push(`/room/${payload.code}`), 700);
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (status !== 'searching') return;
    setWaitSec(0);
    const t = window.setInterval(() => setWaitSec((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  function startSearch(timeControl: string) {
    setPicked(timeControl);
    setStatus('searching');
    socketRef.current?.emit(SocketEvents.MatchSearch, timeControl);
  }
  function cancel() {
    socketRef.current?.emit(SocketEvents.MatchCancel);
    setStatus('idle');
    setPicked(null);
  }

  // ---- Приглашение друга ----
  function openInvite() {
    setInviteError(null);
    setLinkCopied(false);
    setInvite({ mode: 'picking', timeControl: TIME_CONTROLS[2]?.id ?? TIME_CONTROLS[0].id });
  }
  function closeInvite() {
    setInvite({ mode: 'closed' });
    setInviteError(null);
    setLinkCopied(false);
  }
  async function createInviteRoom() {
    if (invite.mode !== 'picking') return;
    setInvite({ mode: 'creating', timeControl: invite.timeControl });
    setInviteError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Партия с другом',
          kind: 'casual',
          timeControl: invite.timeControl,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Не удалось создать комнату');
      }
      const data = (await res.json()) as { code: string };
      setInvite({ mode: 'created', timeControl: invite.timeControl, code: data.code });
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Ошибка');
      setInvite({ mode: 'picking', timeControl: invite.timeControl });
    }
  }
  function inviteUrl(code: string): string {
    if (typeof window === 'undefined') return `/room/${code}`;
    return `${window.location.origin}/room/${code}`;
  }
  async function copyInviteLink() {
    if (invite.mode !== 'created') return;
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.code));
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (status === 'searching' || status === 'found') {
    return (
      <div className="card text-center">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
        <h2 className="mt-4 font-display text-2xl">
          {status === 'found' ? 'Соперник найден!' : 'Ищем соперника…'}
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {picked && (
            <>
              Контроль: <b>{TIME_CONTROLS.find((t) => t.id === picked)?.label}</b>
            </>
          )}
        </p>
        {status === 'searching' && <p className="mt-1 text-xs text-stone-500">Ожидание: {waitSec}s</p>}
        {status === 'found' && opponent && (
          <p className="mt-2 text-sm">
            Против вас: <b>{opponent}</b>
          </p>
        )}
        {status === 'searching' && (
          <button onClick={cancel} className="btn-outline mt-5">
            Отмена
          </button>
        )}
      </div>
    );
  }

  const groups = [
    { kind: 'bullet', title: 'Пуля' },
    { kind: 'blitz', title: 'Блиц' },
    { kind: 'rapid', title: 'Рапид' },
    { kind: 'classical', title: 'Классика' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Приглашение друга */}
      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Пригласить друга</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Создайте приватную комнату с выбранным таймером и отправьте ссылку другу.
            </p>
          </div>
          {invite.mode === 'closed' ? (
            <button type="button" onClick={openInvite} className="btn-primary shrink-0">
              🔗 Пригласить
            </button>
          ) : (
            <button type="button" onClick={closeInvite} className="btn-ghost shrink-0 text-xs">
              Закрыть
            </button>
          )}
        </div>

        {(invite.mode === 'picking' || invite.mode === 'creating') && (
          <div className="space-y-3">
            <div className="space-y-2">
              {groups.map((g) => {
                const items = TIME_CONTROLS.filter((t) => t.kind === g.kind);
                return (
                  <div key={g.kind}>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
                      {g.title}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((t) => {
                        const active = invite.timeControl === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={invite.mode === 'creating'}
                            onClick={() =>
                              setInvite({ mode: 'picking', timeControl: t.id })
                            }
                            className={cn(
                              'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                              active
                                ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                                : 'border-stone-300/70 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-200 dark:hover:bg-stone-800',
                              invite.mode === 'creating' && 'opacity-60',
                            )}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {inviteError && (
              <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                {inviteError}
              </div>
            )}
            <button
              type="button"
              onClick={createInviteRoom}
              disabled={invite.mode === 'creating'}
              className="btn-primary w-full sm:w-auto"
            >
              {invite.mode === 'creating' ? 'Создаём…' : 'Создать ссылку-приглашение'}
            </button>
          </div>
        )}

        {invite.mode === 'created' && (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              Комната создана. Контроль: <b>{timeControlLabel(invite.timeControl)}</b>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={inviteUrl(invite.code)}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 font-mono text-xs"
              />
              <button type="button" onClick={copyInviteLink} className="btn-outline shrink-0">
                {linkCopied ? '✓ Скопировано' : '📋 Скопировать'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/room/${invite.code}`)}
                className="btn-primary shrink-0"
              >
                Открыть комнату →
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Отправьте эту ссылку другу — он войдёт в ту же комнату и вы сможете сыграть.
            </p>
          </div>
        )}
      </section>

      {/* Поиск случайного соперника */}
      <section>
        <h2 className="mb-2 font-display text-lg font-semibold">Случайный соперник</h2>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
          Нажмите контроль времени — найдём свободного игрока.
        </p>
        <div className="space-y-6">
          {groups.map((g) => {
            const items = TIME_CONTROLS.filter((t) => t.kind === g.kind);
            return (
              <div key={g.kind}>
                <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">
                  {g.title}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => startSearch(t.id)}
                      className={cn(
                        'tile px-5 py-4 text-center text-base font-semibold',
                        picked === t.id && 'ring-2 ring-brand-400',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
