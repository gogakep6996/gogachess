'use client';

// Игровая зона турнирной партии в стиле Lichess-арены:
//
//   ┌────────┬─────────────┬────────────────────┐
//   │        │             │  ⏰ Соперник        │ ← часы вверху
//   │ Турнир.│             ├────────────────────┤
//   │ табл.  │   ДОСКА     │  ● opponent  #1    │
//   │ + врем.│  по центру  ├────────────────────┤
//   │ конца  │             │  |◀ ◀ ▶ ▶|         │
//   │        │             │  список ходов      │
//   │        │             ├────────────────────┤
//   │        │             │     ↶  ½  🏳️       │ ← иконки действий
//   │        │             ├────────────────────┤
//   │        │             │  ● Я  #2           │
//   │        │             ├────────────────────┤
//   │        │             │  ⏰ Мои             │ ← часы снизу
//   └────────┴─────────────┴────────────────────┘

import { useEffect, useMemo, useState } from 'react';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { ClockDisplay } from './ClockDisplay';
import { MaterialBar } from './MaterialBar';
import { DrawOfferToast } from './DrawOfferToast';
import { MoveNav } from './MoveNav';
import { StandingsTable } from './StandingsTable';
import { TournamentCountdown } from './TournamentCountdown';
import {
  STARTING_FEN,
  type TournamentLivePayload,
  type TournamentStandingDto,
} from '@/lib/socket-events';

interface Props {
  roomCode: string;
  meId: string;
  whiteName: string;
  blackName: string;
  whiteRank?: number;
  blackRank?: number;
  onReturnToTournament: () => void;
  tournament: TournamentLivePayload | null;
  standings: TournamentStandingDto[];
}

// Доска того же размера, что в просмотре чужих партий.
const BOARD_SIDE = 'min(94vw, 480px)';

export function TournamentGameView({
  roomCode,
  meId,
  whiteName,
  blackName,
  whiteRank,
  blackRank,
  onReturnToTournament,
  tournament,
  standings,
}: Props) {
  const room = useRoomSocket(roomCode);
  const state = room.state;

  // ВАЖНО: все хуки сверху, до любого раннего return.
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const historyLen = state?.history.length ?? 0;
  useEffect(() => {
    setViewIdx(null);
  }, [historyLen]);

  const viewedFen = useMemo(() => {
    if (!state) return STARTING_FEN;
    if (viewIdx === null) return state.fen;
    if (viewIdx === -1) return state.segmentStartFen || STARTING_FEN;
    const entry = state.history[viewIdx];
    return entry?.fen ?? state.fen;
  }, [viewIdx, state]);

  if (!state) {
    return (
      <div className="card text-center text-sm text-stone-500">
        Подключаемся к партии…
      </div>
    );
  }

  const myColor: 'w' | 'b' | null =
    state.whiteId === meId ? 'w' : state.blackId === meId ? 'b' : null;
  const iAmPlayer = myColor !== null;
  const flipped = myColor === 'b';

  const isViewingPast = viewIdx !== null;
  const result = state.result;
  const gameLive = !result;
  const sideToMove = (state.fen.split(' ')[1] ?? 'w') as 'w' | 'b';
  const canMove =
    gameLive && iAmPlayer && !isViewingPast && sideToMove === myColor && room.connected;

  const lastEntry = state.history.length > 0 ? state.history[state.history.length - 1] : null;
  const highlights = lastEntry ? { from: lastEntry.from, to: lastEntry.to } : undefined;

  const topColor: 'w' | 'b' = flipped ? 'w' : 'b';
  const bottomColor: 'w' | 'b' = flipped ? 'b' : 'w';
  const topName = topColor === 'w' ? whiteName : blackName;
  const bottomName = bottomColor === 'w' ? whiteName : blackName;
  const topRank = topColor === 'w' ? whiteRank : blackRank;
  const bottomRank = bottomColor === 'w' ? whiteRank : blackRank;
  const topUserId = topColor === 'w' ? state.whiteId : state.blackId;
  const bottomUserId = bottomColor === 'w' ? state.whiteId : state.blackId;

  // Присутствие игрока «за доской» — он в этой room по сокетам.
  const presentIds = new Set(state.participants.map((p) => p.userId));
  const topPresent = topUserId ? presentIds.has(topUserId) : false;
  const bottomPresent = bottomUserId ? presentIds.has(bottomUserId) : false;

  const handleResign = () => {
    if (!confirmResign) {
      setConfirmResign(true);
      window.setTimeout(() => setConfirmResign(false), 4000);
      return;
    }
    setConfirmResign(false);
    room.resign();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
      {/* Левая колонка: countdown + таблица */}
      <aside className="order-2 flex flex-col gap-3 lg:order-1">
        {tournament && (
          <TournamentCountdown status={tournament.status} endsAt={tournament.endsAt} />
        )}
        <StandingsTable standings={standings} meId={meId} />
      </aside>

      {/* Центр: только доска, без полосок сверху/снизу — чтобы её верх лёг
          ровно по верху строки (на уровень блока «До окончания турнира»). */}
      <section className="order-1 flex flex-col items-center lg:order-2">
        <div className="mx-auto" style={{ width: BOARD_SIDE, height: BOARD_SIDE }}>
          <ChessBoard
            fen={viewedFen}
            canMove={canMove}
            isEditing={false}
            canEdit={false}
            flipped={flipped}
            sideLock={iAmPlayer ? myColor : null}
            highlights={highlights}
            onMove={room.sendMove}
            compact
            fillContainer
          />
        </div>
      </section>

      {/* Правая колонка: Lichess-style, центрирована по высоте доски,
          MaterialBar перенесён в ряды с никами. */}
      <aside className="order-3 flex flex-col justify-center gap-2 self-stretch">
        {state.clock && <ClockDisplay clock={state.clock} side={topColor} />}

        <PlayerRow
          name={topName}
          rank={topRank}
          present={topPresent}
          isMe={iAmPlayer && topColor === myColor}
          fen={viewedFen}
          capturedColor={topColor}
        />

        <div className="card !p-2">
          <MoveNav history={state.history} viewIdx={viewIdx} onSelect={setViewIdx} />
        </div>

        {iAmPlayer && gameLive && (
          <div className="flex items-center justify-around rounded-lg bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/40">
            <IconButton
              title="Предложить ничью"
              onClick={() => room.offerDraw()}
              disabled={!!state.drawOffer && state.drawOffer.fromUserId === meId}
            >
              ½
            </IconButton>
            <IconButton
              title={confirmResign ? 'Точно сдаюсь — нажмите ещё раз' : 'Сдаться'}
              onClick={handleResign}
              variant={confirmResign ? 'danger' : 'default'}
            >
              {/* Белый флаг — сдача */}
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 3v18M4 4h12l-2 4 2 4H4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </div>
        )}

        {state.drawOffer && gameLive && (
          <DrawOfferToast
            offer={state.drawOffer}
            myUserId={meId}
            onAccept={() => room.acceptDraw()}
            onDecline={() => room.declineDraw()}
          />
        )}

        <PlayerRow
          name={bottomName}
          rank={bottomRank}
          present={bottomPresent}
          isMe={iAmPlayer && bottomColor === myColor}
          fen={viewedFen}
          capturedColor={bottomColor}
        />

        {state.clock && (
          <ClockDisplay
            clock={state.clock}
            side={bottomColor}
            isMine={iAmPlayer && bottomColor === myColor}
          />
        )}

        {result && (
          <GameResultPanel
            result={result}
            myColor={myColor}
            whiteName={whiteName}
            blackName={blackName}
            onReturn={onReturnToTournament}
          />
        )}

        {room.error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
            {room.error}
          </div>
        )}
      </aside>
    </div>
  );
}

function PlayerRow({
  name,
  rank,
  present,
  isMe,
  fen,
  capturedColor,
}: {
  name: string;
  rank?: number;
  present: boolean;
  isMe?: boolean;
  fen?: string;
  capturedColor?: 'w' | 'b';
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md px-2 py-1 text-sm ${
        isMe ? 'bg-brand-500/10' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
              present ? 'bg-emerald-500' : 'bg-stone-400 dark:bg-stone-600'
            }`}
            title={present ? 'За доской' : 'Вне доски'}
          />
          <span
            className={`truncate font-semibold ${
              isMe ? 'text-brand-700 dark:text-brand-300' : ''
            }`}
          >
            {name}
          </span>
        </span>
        {rank ? (
          <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            #{rank}
          </span>
        ) : null}
      </div>
      {fen && capturedColor ? (
        <MaterialBar fen={fen} color={capturedColor} compact />
      ) : null}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
  disabled,
  variant = 'default',
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-md text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === 'danger'
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-700'
      }`}
    >
      {children}
    </button>
  );
}

function GameResultPanel({
  result,
  myColor,
  whiteName,
  blackName,
  onReturn,
}: {
  result: NonNullable<ReturnType<typeof useRoomSocket>['state']>['result'];
  myColor: 'w' | 'b' | null;
  whiteName: string;
  blackName: string;
  onReturn: () => void;
}) {
  if (!result) return null;
  const myOutcome: 'win' | 'loss' | 'draw' =
    result.outcome === 'draw'
      ? 'draw'
      : (myColor === 'w' && result.outcome === 'white') ||
          (myColor === 'b' && result.outcome === 'black')
        ? 'win'
        : myColor !== null
          ? 'loss'
          : 'draw';
  const title =
    result.outcome === 'draw'
      ? 'Ничья'
      : result.outcome === 'white'
        ? `Победа: ${whiteName} (белые)`
        : `Победа: ${blackName} (чёрные)`;
  const reasonLabel =
    result.reason === 'checkmate'
      ? 'мат'
      : result.reason === 'resignation'
        ? 'сдача'
        : result.reason === 'timeout'
          ? 'время'
          : result.reason === 'draw-agreement'
            ? 'по соглашению'
            : result.reason === 'stalemate'
              ? 'пат'
              : result.reason === 'insufficient-material'
                ? 'недостаточно материала'
                : result.reason === 'threefold'
                  ? 'троекратное повторение'
                  : result.reason === 'fifty-move'
                    ? 'правило 50 ходов'
                    : '';

  return (
    <div
      className={`card !p-3 text-center text-sm ${
        myOutcome === 'win'
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
          : myOutcome === 'loss'
            ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30'
            : ''
      }`}
    >
      <div className="text-base font-semibold">{title}</div>
      {reasonLabel && (
        <div className="mb-2 text-xs uppercase tracking-wide text-stone-500">{reasonLabel}</div>
      )}
      <button onClick={onReturn} className="btn-primary w-full">
        Вернуться в турнир
      </button>
    </div>
  );
}
