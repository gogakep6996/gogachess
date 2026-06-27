'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  STARTING_FEN,
  type ChatMessageDto,
  type MatchFoundPayload,
  type RoomStatePayload,
  type TournamentLivePayload,
  type TournamentMatchDto,
} from '@/lib/socket-events';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { ChatPanel } from '@/components/room/ChatPanel';
import { TournamentGameView } from '@/components/tournament/TournamentGameView';
import { StandingsTable } from '@/components/tournament/StandingsTable';
import { TournamentCountdown } from '@/components/tournament/TournamentCountdown';
import { OwnerControls } from '@/components/tournament/OwnerControls';

// Размер ограничен и по ширине, и по высоте окна — чтобы доску не обрезало снизу.
const BOARD_SIDE = 'min(94vw, calc(100dvh - 13rem), 520px)';

interface Props {
  id: string;
  name: string;
  meId: string | null;
  isOwner: boolean;
  initiallyJoined: boolean;
}

export function TournamentClient({ id, name, meId, isOwner, initiallyJoined }: Props) {
  const [data, setData] = useState<TournamentLivePayload | null>(null);
  const [joined, setJoined] = useState(initiallyJoined);
  // Просмотр чужой партии (пока я НЕ играю).
  const [spectateCode, setSpectateCode] = useState<string | null>(null);
  // Код МОЕЙ активной партии (живой или только что завершённой, пока не нажат «Вернуться в турнир»).
  const [activeMatchCode, setActiveMatchCode] = useState<string | null>(null);

  // При монтировании восстанавливаем код партии из sessionStorage — чтобы при
  // обновлении страницы остаться за партией, не дожидаясь прихода live-данных
  // (иначе на миг показывается лобби и «выбрасывает» из партии).
  useEffect(() => {
    const saved = window.sessionStorage.getItem(`tournament:${id}:active`);
    if (saved) setActiveMatchCode((cur) => cur ?? saved);
  }, [id]);

  // Сохраняем/чистим код активной партии в sessionStorage (живёт до закрытия вкладки).
  useEffect(() => {
    if (activeMatchCode) {
      window.sessionStorage.setItem(`tournament:${id}:active`, activeMatchCode);
    } else {
      window.sessionStorage.removeItem(`tournament:${id}:active`);
    }
  }, [activeMatchCode, id]);
  // Общий чат участников турнира (live, in-memory на сервере).
  const [chat, setChat] = useState<ChatMessageDto[]>([]);
  // Свёрнут ли блок «История партий» (по умолчанию — да, экономим место).
  const [historyOpen, setHistoryOpen] = useState(false);
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
    s.on(SocketEvents.TournamentChatHistory, (msgs: ChatMessageDto[]) => setChat(msgs));
    s.on(SocketEvents.TournamentChatNew, (m: ChatMessageDto) =>
      setChat((prev) => [...prev, m]),
    );
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [id]);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit(SocketEvents.TournamentChatSend, text);
  }, []);

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

  // «Приостановить»: выходим из партии в лобби, НЕ возвращаясь в подбор —
  // игрок остаётся в турнире, но новых партий ему не подбирают, пока он сам
  // не нажмёт «Участвовать». Можно спокойно уйти на главную.
  const handlePauseFromGame = useCallback(async () => {
    setActiveMatchCode(null);
    setJoined(false);
    await fetch(`/api/tournaments/${id}/leave`, { method: 'POST' });
  }, [id]);

  const liveMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status === 'live' && m.roomCode),
    [data],
  );
  const finishedMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.status !== 'live').slice(0, 50),
    [data],
  );

  const activeMatch: TournamentMatchDto | null = useMemo(() => {
    if (!activeMatchCode) return null;
    return (data?.matches ?? []).find((m) => m.roomCode === activeMatchCode) ?? null;
  }, [activeMatchCode, data?.matches]);

  // Просмотр любой партии (живой или завершённой) — ищем по всем матчам.
  const spectateMatch =
    spectateCode && !activeMatchCode
      ? ((data?.matches ?? []).find((m) => m.roomCode === spectateCode) ?? null)
      : null;

  // Ранги игроков по userId — для значков #N.
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.standings ?? []) map.set(s.userId, s.rank);
    return map;
  }, [data?.standings]);

  // Я в активной партии? Заголовок турнира НЕ показываем — экономим вертикальное место,
  // чтобы вся доска влезала в экран без скролла.
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
        onPause={handlePauseFromGame}
        tournament={data}
        chatMessages={chat}
        onChatSend={sendChat}
      />
    );
  }

  // Я НЕ в активной партии: показываем заголовок турнира и классический лэйаут.
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-3 font-display text-2xl font-semibold">{name}</h1>
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
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-paper px-4 py-2.5 text-left transition hover:brightness-95 dark:border-stone-700 dark:bg-stone-900"
            >
              <span className="text-sm font-semibold">
                История партий
                <span className="ml-2 text-xs font-normal text-stone-500">
                  {finishedMatches.length}
                </span>
              </span>
              <span className="text-xs text-stone-500">
                {historyOpen ? 'свернуть ▲' : 'развернуть ▼'}
              </span>
            </button>
            {historyOpen && (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {finishedMatches.map((m) => {
                  const score =
                    m.status === 'white'
                      ? '1–0'
                      : m.status === 'black'
                        ? '0–1'
                        : m.status === 'draw'
                          ? '½–½'
                          : m.status;
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => m.roomCode && setSpectateCode(m.roomCode)}
                        disabled={!m.roomCode}
                        title={m.roomCode ? 'Посмотреть партию' : 'Партия недоступна для просмотра'}
                        className="card flex w-full items-center justify-between gap-2 text-left text-sm transition enabled:hover:brightness-95 disabled:cursor-default disabled:opacity-60"
                      >
                        <span className="truncate">
                          {m.whiteName} vs {m.blackName}
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">{score}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-3 lg:h-[calc(100vh-5rem)]">
        {data && (
          <TournamentCountdown
            status={data.status}
            startsAt={data.startsAt}
            endsAt={data.endsAt}
          />
        )}

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

        {isOwner && <OwnerControls id={id} status={data?.status ?? 'scheduled'} />}

        <StandingsTable standings={data?.standings ?? []} meId={meId} scrollRows={4} />

        {/* Общий чат участников турнира — занимает всё оставшееся место до низа. */}
        <div className="min-h-[16rem] flex-1">
          <ChatPanel variant="compact" messages={chat} meId={meId ?? ''} onSend={sendChat} />
        </div>
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
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  // null = «следить за последней позицией»; число = просматриваемый полуход.
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    s.on('connect', () => s.emit(SocketEvents.RoomJoin, roomCode));
    s.on(SocketEvents.RoomState, (st: RoomStatePayload) => setRoomState(st));
    return () => {
      s.disconnect();
    };
  }, [roomCode]);

  // Список позиций: стартовая + после каждого хода. Индекс 0 = начальная позиция.
  const fens = useMemo(() => {
    const start = roomState?.segmentStartFen || STARTING_FEN;
    const moves = roomState?.history ?? [];
    return [start, ...moves.map((h) => h.fen)];
  }, [roomState]);

  const lastIdx = fens.length - 1;
  const idx = viewIdx === null ? lastIdx : Math.min(Math.max(viewIdx, 0), lastIdx);
  const displayFen = fens[idx] ?? STARTING_FEN;
  const moves = roomState?.history ?? [];
  const lastMove = idx >= 1 ? moves[idx - 1] : undefined;

  const go = (next: number | null) => {
    if (next === null || next >= lastIdx) setViewIdx(null);
    else setViewIdx(Math.max(0, next));
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full items-center justify-between gap-3">
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
        <button onClick={onBack} className="btn-outline shrink-0 text-xs">
          ← К сетке
        </button>
      </div>

      <div style={{ width: BOARD_SIDE, height: BOARD_SIDE }}>
        <ChessBoard
          fen={displayFen}
          canMove={false}
          isEditing={false}
          canEdit={false}
          highlights={lastMove ? { from: lastMove.from, to: lastMove.to } : undefined}
          compact
          fillContainer
          silent
        />
      </div>

      {/* Навигация по ходам партии */}
      <div
        className="mt-2 flex items-center justify-center gap-1"
        style={{ width: BOARD_SIDE }}
      >
        <NavBtn onClick={() => go(0)} disabled={idx <= 0} label="⏮" title="В начало" />
        <NavBtn onClick={() => go(idx - 1)} disabled={idx <= 0} label="◀" title="Назад" />
        <span className="min-w-[5rem] text-center text-xs font-semibold tabular-nums text-stone-500">
          ход {idx} / {lastIdx}
        </span>
        <NavBtn onClick={() => go(idx + 1)} disabled={idx >= lastIdx} label="▶" title="Вперёд" />
        <NavBtn onClick={() => go(null)} disabled={idx >= lastIdx} label="⏭" title="В конец" />
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  disabled,
  label,
  title,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-paper text-sm text-stone-700 transition enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
    >
      {label}
    </button>
  );
}
