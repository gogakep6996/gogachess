'use client';

// Полноценная игровая зона для турнирной партии — без редиректа в /room/CODE.
// Подключается к существующему сокету комнаты через useRoomSocket, рендерит
// доску, часы, кнопки сдачи/ничьей, материал и перемотку.
//
// Лэйаут (desktop):
//   ┌──────────────┬───────────────────┬──────────────┐
//   │ Турнирная    │   ШАПКА СОПЕРНИКА │ ⏰ соперник   │
//   │ таблица      │   (имя · #N · cap)│              │
//   │ (+ countdown │   ┌─────────────┐ │  ½ / ✕       │
//   │  турнира)    │   │   ДОСКА     │ │  материал /  │
//   │              │   └─────────────┘ │  ходы /      │
//   │              │   ШАПКА МОЯ       │  результат   │
//   │              │   (имя · #N · cap)│              │
//   │              │                   │ ⏰ моё        │
//   └──────────────┴───────────────────┴──────────────┘
//
// Жизненный цикл:
//   1. Партия живая (state.result === null)         → играем
//   2. Партия окончена (state.result !== null)      → результат + «Вернуться в турнир»
//
// onReturnToTournament() — родитель отписывает игрока от текущей партии и
// (при желании) запускает новый join, чтобы попасть в подбор.

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
  /** Код турнирной комнаты, в которой идёт партия. */
  roomCode: string;
  /** Мой userId — нужен, чтобы понять, играю я или зритель. */
  meId: string;
  /** Имена сторон (рендерим вокруг часов). Из TournamentMatchDto. */
  whiteName: string;
  blackName: string;
  /** Места в турнирной таблице (для значка #N рядом с никами). */
  whiteRank?: number;
  blackRank?: number;
  /** Что делать, когда игрок нажал «Вернуться в турнир». */
  onReturnToTournament: () => void;
  /** Турнирные данные — для левой колонки (таблица + countdown). */
  tournament: TournamentLivePayload | null;
  /** Standings отдельно — на случай если нужны актуальнее, чем tournament.standings. */
  standings: TournamentStandingDto[];
}

// Размер доски — тот же, что используется при просмотре чужих партий
// (SelectedBoard.BOARD_SIDE), чтобы визуально не «прыгало» при переходе play↔spectate.
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

  // ВАЖНО: ВСЕ хуки ОБЯЗАНЫ вызываться в одном и том же порядке на каждом рендере,
  // даже если state ещё null. Иначе React выбрасывает Minified error #310.
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

  // Сверху всегда — соперник, снизу — я (если я игрок). Зрителю — белые снизу.
  const topColor: 'w' | 'b' = flipped ? 'w' : 'b';
  const bottomColor: 'w' | 'b' = flipped ? 'b' : 'w';
  const topName = topColor === 'w' ? whiteName : blackName;
  const bottomName = bottomColor === 'w' ? whiteName : blackName;
  const topRank = topColor === 'w' ? whiteRank : blackRank;
  const bottomRank = bottomColor === 'w' ? whiteRank : blackRank;

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
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
      {/* Левая колонка: countdown турнира + таблица */}
      <aside className="order-2 flex flex-col gap-3 lg:order-1">
        {tournament && (
          <TournamentCountdown status={tournament.status} endsAt={tournament.endsAt} />
        )}
        <StandingsTable standings={standings} meId={meId} />
      </aside>

      {/* Центр: доска */}
      <section className="order-1 flex flex-col items-center gap-2 lg:order-2">
        <div className="w-full" style={{ maxWidth: BOARD_SIDE }}>
          <PlayerHeader
            name={topName}
            rank={topRank}
            fen={viewedFen}
            materialColor={topColor}
          />
        </div>
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
        <div className="w-full" style={{ maxWidth: BOARD_SIDE }}>
          <PlayerHeader
            name={bottomName}
            rank={bottomRank}
            fen={viewedFen}
            materialColor={bottomColor}
            isMe={iAmPlayer && bottomColor === myColor}
          />
        </div>
      </section>

      {/* Правая колонка: часы по краям, между ними — функции */}
      <aside className="order-3 flex flex-col justify-between gap-3" style={{ minHeight: BOARD_SIDE }}>
        {/* Верх: часы соперника */}
        {state.clock ? (
          <ClockDisplay clock={state.clock} side={topColor} />
        ) : (
          <div />
        )}

        {/* Центр: кнопки / ничья / материал / ходы / результат */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {iAmPlayer && gameLive && (
            <div className="flex gap-2">
              <button
                className="btn-outline flex-1 text-sm"
                onClick={() => room.offerDraw()}
                disabled={!!state.drawOffer && state.drawOffer.fromUserId === meId}
              >
                ½ Ничья
              </button>
              <button
                className={`flex-1 text-sm ${confirmResign ? 'btn-primary bg-red-600 hover:bg-red-700' : 'btn-outline'}`}
                onClick={handleResign}
              >
                {confirmResign ? 'Точно сдаюсь' : '✕ Сдаться'}
              </button>
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

          {result && (
            <GameResultPanel
              result={result}
              myColor={myColor}
              whiteName={whiteName}
              blackName={blackName}
              onReturn={onReturnToTournament}
            />
          )}

          <div className="card !p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Ходы
            </h4>
            <MoveNav history={state.history} viewIdx={viewIdx} onSelect={setViewIdx} />
          </div>

          {room.error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              {room.error}
            </div>
          )}
        </div>

        {/* Низ: мои часы */}
        {state.clock ? (
          <ClockDisplay
            clock={state.clock}
            side={bottomColor}
            isMine={iAmPlayer && bottomColor === myColor}
          />
        ) : (
          <div />
        )}
      </aside>
    </div>
  );
}

function PlayerHeader({
  name,
  rank,
  fen,
  materialColor,
  isMe,
}: {
  name: string;
  rank?: number;
  fen: string;
  materialColor: 'w' | 'b';
  isMe?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-stone-100/70 px-3 py-1.5 dark:bg-stone-800/40">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={isMe ? 'text-brand-700 dark:text-brand-300' : ''}>{name}</span>
        {rank ? (
          <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            #{rank}
          </span>
        ) : null}
      </div>
      <MaterialBar fen={fen} color={materialColor} />
    </div>
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
      className={`card !p-4 text-center ${
        myOutcome === 'win'
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
          : myOutcome === 'loss'
            ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30'
            : ''
      }`}
    >
      <div className="text-lg font-semibold">{title}</div>
      {reasonLabel && (
        <div className="mb-3 text-xs uppercase tracking-wide text-stone-500">
          {reasonLabel}
        </div>
      )}
      <button onClick={onReturn} className="btn-primary w-full">
        Вернуться в турнир
      </button>
    </div>
  );
}
