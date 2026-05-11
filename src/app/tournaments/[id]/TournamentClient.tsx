'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  type RoomStatePayload,
  type TournamentLivePayload,
} from '@/lib/socket-events';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MiniBoard } from '@/components/chess/MiniBoard';

const BOARD_SIDE = 'min(94vw, 480px)';

interface Props {
  id: string;
  meId: string | null;
  initiallyJoined: boolean;
}

export function TournamentClient({ id, meId, initiallyJoined }: Props) {
  const [data, setData] = useState<TournamentLivePayload | null>(null);
  const [joined, setJoined] = useState(initiallyJoined);
  const [selected, setSelected] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Лёгкий socket для лайв-обновлений турнира + fallback REST.
  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = s;
    s.on('connect', () => s.emit(SocketEvents.TournamentLive, id));
    s.on(SocketEvents.TournamentState, (p: TournamentLivePayload) => {
      if (p.id === id) setData(p);
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [id]);

  // Fallback REST раз в 4с (на случай если сервер ещё не успел разослать live)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/tournaments/${id}`, { cache: 'no-store' });
        const j = (await r.json()) as TournamentLivePayload | null;
        if (!cancelled && j) setData((prev) => prev ?? j);
      } catch {
        // ignore
      }
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [id]);

  const join = useCallback(async () => {
    const r = await fetch(`/api/tournaments/${id}/join`, { method: 'POST' });
    if (r.ok) setJoined(true);
  }, [id]);
  const leave = useCallback(async () => {
    const r = await fetch(`/api/tournaments/${id}/leave`, { method: 'POST' });
    if (r.ok) setJoined(false);
  }, [id]);

  const liveMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status === 'live' && m.roomCode),
    [data],
  );
  const finishedMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status !== 'live').slice(0, 12),
    [data],
  );

  const selectedMatch = liveMatches.find((m) => m.roomCode === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        {selectedMatch ? (
          <SelectedBoard
            roomCode={selectedMatch.roomCode!}
            whiteName={selectedMatch.whiteName}
            blackName={selectedMatch.blackName}
            onBack={() => setSelected(null)}
          />
        ) : (
          <LiveGrid
            matches={liveMatches.map((m) => ({
              code: m.roomCode!,
              whiteName: m.whiteName,
              blackName: m.blackName,
              fen: m.fen,
            }))}
            onSelect={(code) => setSelected(code)}
          />
        )}
        {finishedMatches.length > 0 && !selectedMatch && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">
              Завершённые партии
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {finishedMatches.map((m) => (
                <li key={m.id} className="card flex items-center justify-between text-sm">
                  <span>
                    {m.whiteName} vs {m.blackName}
                  </span>
                  <span className="text-xs text-stone-500">
                    {m.status === 'white'
                      ? '1–0'
                      : m.status === 'black'
                        ? '0–1'
                        : m.status === 'draw'
                          ? '½–½'
                          : m.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card">
          <h3 className="mb-2 font-semibold">
            Статус: <span className="font-normal">{data?.status ?? '…'}</span>
          </h3>
          {data?.endsAt && data.status === 'running' && (
            <p className="text-xs text-stone-500">
              Завершится: {new Date(data.endsAt).toLocaleTimeString('ru-RU')}
            </p>
          )}
          {meId && data?.status !== 'finished' && (
            <button
              onClick={joined ? leave : join}
              className={joined ? 'btn-ghost mt-3 w-full' : 'btn-primary mt-3 w-full'}
            >
              {joined ? 'Я в игре · отменить' : 'Участвовать'}
            </button>
          )}
          {!meId && (
            <Link href="/login" className="btn-primary mt-3 w-full">
              Войти, чтобы участвовать
            </Link>
          )}
        </div>

        <div className="card">
          <h3 className="mb-2 font-semibold">Турнирная таблица</h3>
          {!data || data.standings.length === 0 ? (
            <p className="text-sm text-stone-500">Пока нет участников.</p>
          ) : (
            <ol className="text-sm">
              {data.standings.map((p) => (
                <li
                  key={p.userId}
                  className={`flex items-center justify-between gap-2 border-b border-stone-200/60 py-1.5 last:border-0 dark:border-stone-800/60 ${
                    meId === p.userId ? 'font-semibold text-brand-700 dark:text-brand-300' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-right tabular-nums text-stone-500">{p.rank}.</span>
                    <span>{p.name}</span>
                    {p.isAvailable ? (
                      <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        свободен
                      </span>
                    ) : (
                      <span className="badge bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        играет
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {p.score.toFixed(1).replace('.0', '')} / {p.played}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

function LiveGrid({
  matches,
  onSelect,
}: {
  matches: { code: string; whiteName: string; blackName: string; fen?: string }[];
  onSelect: (code: string) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="card text-center text-sm text-stone-500">
        Сейчас нет идущих партий. Они появятся, как только турнир начнётся и подберутся пары.
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {matches.map((m) => (
        <button
          key={m.code}
          onClick={() => onSelect(m.code)}
          className="tile flex flex-col items-center gap-2 p-3 text-center"
        >
          <MiniBoard fen={m.fen} size={160} />
          <div className="text-sm">
            <div className="font-medium">{m.whiteName}</div>
            <div className="text-xs text-stone-500">vs</div>
            <div className="font-medium">{m.blackName}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SelectedBoard({
  roomCode,
  whiteName,
  blackName,
  onBack,
}: {
  roomCode: string;
  whiteName: string;
  blackName: string;
  onBack: () => void;
}) {
  const [fen, setFen] = useState<string | undefined>(undefined);

  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    s.on('connect', () => s.emit(SocketEvents.RoomJoin, roomCode));
    s.on(SocketEvents.RoomState, (st: RoomStatePayload) => setFen(st.fen));
    s.on(SocketEvents.EditUpdate, (f: string) => setFen(f));
    return () => {
      s.disconnect();
    };
  }, [roomCode]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold">{whiteName}</span>{' '}
          <span className="text-stone-500">— белые</span>
          <span className="mx-2 text-stone-400">·</span>
          <span className="font-semibold">{blackName}</span>{' '}
          <span className="text-stone-500">— чёрные</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-outline text-xs">
            ← К сетке
          </button>
          <Link href={`/room/${roomCode}`} className="btn-primary text-xs">
            Открыть в комнате
          </Link>
        </div>
      </div>
      <div className="mx-auto" style={{ width: BOARD_SIDE, height: BOARD_SIDE }}>
        <ChessBoard
          fen={fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
          canMove={false}
          isEditing={false}
          canEdit={false}
          compact
          fillContainer
          silent
        />
      </div>
    </div>
  );
}
