'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  type MatchFoundPayload,
  type RoomStatePayload,
  type TournamentLivePayload,
  type TournamentMatchDto,
} from '@/lib/socket-events';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { TournamentGameView } from '@/components/tournament/TournamentGameView';
import { StandingsTable } from '@/components/tournament/StandingsTable';
import { TournamentCountdown } from '@/components/tournament/TournamentCountdown';

const BOARD_SIDE = 'min(94vw, 480px)';

interface Props {
  id: string;
  meId: string | null;
  initiallyJoined: boolean;
}

export function TournamentClient({ id, meId, initiallyJoined }: Props) {
  const [data, setData] = useState<TournamentLivePayload | null>(null);
  const [joined, setJoined] = useState(initiallyJoined);
  // Просмотр чужой партии (пока я НЕ играю).
  const [spectateCode, setSpectateCode] = useState<string | null>(null);
  // Код МОЕЙ активной партии (живой или только что завершённой, пока не нажат «Вернуться в турнир»).
  const [activeMatchCode, setActiveMatchCode] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Лёгкий socket для лайв-обновлений турнира + получения MatchFound (автопереход на свою партию).
  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = s;
    s.on('connect', () => s.emit(SocketEvents.TournamentLive, id));
    s.on(SocketEvents.TournamentState, (p: TournamentLivePayload) => {
      if (p.id === id) setData(p);
    });
    s.on(SocketEvents.MatchFound, (p: MatchFoundPayload) => {
      setActiveMatchCode(p.code);
      setSpectateCode(null);
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

  // Если на бэке уже есть моя живая партия (после reload страницы) — подцепляем её.
  useEffect(() => {
    if (!meId) return;
    if (activeMatchCode) return;
    if (!data) return;
    const mine = (data.matches ?? []).find(
      (m) => m.status === 'live' && m.roomCode && (m.whiteId === meId || m.blackId === meId),
    );
    if (mine?.roomCode) {
      setActiveMatchCode(mine.roomCode);
      setSpectateCode(null);
    }
  }, [data, meId, activeMatchCode]);

  const join = useCallback(async () => {
    const r = await fetch(`/api/tournaments/${id}/join`, { method: 'POST' });
    if (r.ok) setJoined(true);
  }, [id]);
  const leave = useCallback(async () => {
    const r = await fetch(`/api/tournaments/${id}/leave`, { method: 'POST' });
    if (r.ok) setJoined(false);
  }, [id]);

  const handleReturnFromGame = useCallback(async () => {
    setActiveMatchCode(null);
    if (data?.status === 'running') {
      await fetch(`/api/tournaments/${id}/join`, { method: 'POST' });
      setJoined(true);
    }
  }, [data?.status, id]);

  const liveMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status === 'live' && m.roomCode),
    [data],
  );
  const finishedMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status !== 'live').slice(0, 12),
    [data],
  );

  const activeMatch: TournamentMatchDto | null = useMemo(() => {
    if (!activeMatchCode) return null;
    return (data?.matches ?? []).find((m) => m.roomCode === activeMatchCode) ?? null;
  }, [activeMatchCode, data?.matches]);

  const spectateMatch =
    spectateCode && !activeMatchCode
      ? (liveMatches.find((m) => m.roomCode === spectateCode) ?? null)
      : null;

  // Ранги игроков по userId — для значков #N.
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.standings ?? []) map.set(s.userId, s.rank);
    return map;
  }, [data?.standings]);

  // Я в активной партии? Тогда лэйаут другой: [standings_left | board_center | sidebar_right].
  if (activeMatch && meId) {
    return (
      <TournamentGameView
        key={activeMatch.roomCode}
        roomCode={activeMatch.roomCode!}
        meId={meId}
        whiteName={activeMatch.whiteName}
        blackName={activeMatch.blackName}
        whiteRank={ranks.get(activeMatch.whiteId)}
        blackRank={ranks.get(activeMatch.blackId)}
        onReturnToTournament={handleReturnFromGame}
        tournament={data}
        standings={data?.standings ?? []}
      />
    );
  }

  // Я НЕ в активной партии: классический лэйаут [content | sidebar справа].
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        {spectateMatch ? (
          <SelectedBoard
            roomCode={spectateMatch.roomCode!}
            whiteName={spectateMatch.whiteName}
            blackName={spectateMatch.blackName}
            whiteRank={ranks.get(spectateMatch.whiteId)}
            blackRank={ranks.get(spectateMatch.blackId)}
            onBack={() => setSpectateCode(null)}
          />
        ) : (
          <>
            {joined && (
              <div className="mb-4 rounded-xl border border-brand-300/60 bg-brand-50 px-4 py-2 text-sm text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                Ищем соперника… можно пока посмотреть чужие партии.
              </div>
            )}
            <LiveGrid
              matches={liveMatches.map((m) => ({
                code: m.roomCode!,
                whiteName: m.whiteName,
                blackName: m.blackName,
                whiteRank: ranks.get(m.whiteId),
                blackRank: ranks.get(m.blackId),
                fen: m.fen,
              }))}
              onSelect={(code) => setSpectateCode(code)}
            />
          </>
        )}
        {finishedMatches.length > 0 && !spectateMatch && (
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
        {data && <TournamentCountdown status={data.status} endsAt={data.endsAt} />}

        {meId && data?.status !== 'finished' && (
          <button
            onClick={joined ? leave : join}
            className={joined ? 'btn-ghost w-full' : 'btn-primary w-full'}
          >
            {joined ? 'Я в игре · отменить' : 'Участвовать'}
          </button>
        )}
        {!meId && (
          <Link href="/login" className="btn-primary w-full">
            Войти, чтобы участвовать
          </Link>
        )}

        <StandingsTable standings={data?.standings ?? []} meId={meId} />
      </aside>
    </div>
  );
}

function LiveGrid({
  matches,
  onSelect,
}: {
  matches: {
    code: string;
    whiteName: string;
    blackName: string;
    whiteRank?: number;
    blackRank?: number;
    fen?: string;
  }[];
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
            <div className="font-medium">
              {m.whiteName}
              {m.whiteRank ? (
                <span className="ml-1 text-xs text-stone-500">{m.whiteRank}</span>
              ) : null}
            </div>
            <div className="text-xs text-stone-500">vs</div>
            <div className="font-medium">
              {m.blackName}
              {m.blackRank ? (
                <span className="ml-1 text-xs text-stone-500">{m.blackRank}</span>
              ) : null}
            </div>
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
  whiteRank,
  blackRank,
  onBack,
}: {
  roomCode: string;
  whiteName: string;
  blackName: string;
  whiteRank?: number;
  blackRank?: number;
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
          <span className="font-semibold">{whiteName}</span>
          {whiteRank ? (
            <span className="ml-1 text-xs text-stone-500">{whiteRank}</span>
          ) : null}{' '}
          <span className="text-stone-500">— белые</span>
          <span className="mx-2 text-stone-400">·</span>
          <span className="font-semibold">{blackName}</span>
          {blackRank ? (
            <span className="ml-1 text-xs text-stone-500">{blackRank}</span>
          ) : null}{' '}
          <span className="text-stone-500">— чёрные</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-outline text-xs">
            ← К сетке
          </button>
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
