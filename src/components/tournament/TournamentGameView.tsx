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
import { ChatPanel } from '@/components/room/ChatPanel';
import { ClockDisplay } from './ClockDisplay';
import { MaterialBar } from './MaterialBar';
import { DrawOfferToast } from './DrawOfferToast';
import { MoveNav } from './MoveNav';
import { TournamentCountdown } from './TournamentCountdown';
import {
  STARTING_FEN,
  type ChatMessageDto,
  type ClockState,
  type TournamentLivePayload,
} from '@/lib/socket-events';

interface Props {
  roomCode: string;
  meId: string;
  whiteName: string;
  blackName: string;
  whiteRank?: number;
  blackRank?: number;
  onReturnToTournament: () => void;
  /** «Приостановить» — выйти в лобби, не возвращаясь в подбор партий. */
  onPause: () => void;
  tournament: TournamentLivePayload | null;
  /** Общий чат участников турнира. */
  chatMessages: ChatMessageDto[];
  onChatSend: (text: string) => void;
}

// Доска того же размера, что в просмотре чужих партий (десктоп).
const BOARD_SIDE = 'min(94vw, 480px)';
// На телефонах/планшетах доска тянется до самых краёв экрана (full-bleed).
const MOBILE_BOARD_SIDE = 'min(100vw, 480px)';

export function TournamentGameView({
  roomCode,
  meId,
  whiteName,
  blackName,
  whiteRank,
  blackRank,
  onReturnToTournament,
  onPause,
  tournament,
  chatMessages,
  onChatSend,
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

  // ── Общие элементы (используются в обеих раскладках) ──
  const renderBoard = (side: string) => (
    <div className="relative mx-auto" style={{ width: side, height: side }}>
      {gameLive && state.firstMoveDeadlineAt && (
        <FirstMoveTimer
          deadline={state.firstMoveDeadlineAt}
          yourTurn={iAmPlayer && sideToMove === myColor}
        />
      )}
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
  );

  const actionRow = iAmPlayer && gameLive && (
    <div className="flex items-center justify-center gap-8 rounded-lg bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/40">
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
  );

  const drawToast = state.drawOffer && gameLive && (
    <DrawOfferToast
      offer={state.drawOffer}
      myUserId={meId}
      onAccept={() => room.acceptDraw()}
      onDecline={() => room.declineDraw()}
    />
  );

  const resultPanel = result && (
    <GameResultPanel
      result={result}
      myColor={myColor}
      onReturn={onReturnToTournament}
      onPause={onPause}
    />
  );

  const errorBox = room.error && (
    <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
      {room.error}
    </div>
  );

  return (
    <>
      {/* ════════ ШИРОКИЙ ДЕСКТОП (xl+, ≥1280): 3 колонки ════════
          Порог именно xl, а не lg: на iPad Pro портрет (1024px) три колонки
          (260 + доска 480 + 274 + отступы) не помещаются и накладываются. */}
      <div className="hidden gap-4 xl:grid xl:grid-cols-[260px_minmax(0,1fr)_274px]">
        {/* Левая колонка: таймер окончания турнира + общий чат участников. */}
        <aside className="flex min-h-0 flex-col gap-3 xl:h-[480px] xl:self-start">
          {tournament && (
            <TournamentCountdown
              status={tournament.status}
              startsAt={tournament.startsAt}
              endsAt={tournament.endsAt}
            />
          )}
          <div className="min-h-[16rem] flex-1">
            <ChatPanel variant="compact" messages={chatMessages} meId={meId} onSend={onChatSend} />
          </div>
        </aside>

        {/* Центр: доска. */}
        <section className="flex flex-col items-center">{renderBoard(BOARD_SIDE)}</section>

        {/* Правая колонка: Lichess-style. */}
        <aside className="flex flex-col gap-2 xl:h-[480px] xl:self-start xl:overflow-y-auto">
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

          {actionRow}
          {drawToast}

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

          {resultPanel}
          {errorBox}
        </aside>
      </div>

      {/* ════════ ТЕЛЕФОН / ПЛАНШЕТ (< xl, вкл. iPad Pro): вертикально, как в мобильном Lichess ════════
          Сверху доски — ник соперника слева, его часы справа (по краям доски).
          Снизу доски — то же для меня. Дальше: действия, результат, история, чат.
          На планшете (md+) история и чат раскладываются в два столбца — чтобы
          использовать ширину и не оставлять пустоту по бокам. */}
      <div className="flex flex-col items-center gap-2 xl:hidden">
        {/* Доска + строки игроков тянутся на всю ширину экрана: отрицательные
            поля гасят горизонтальные отступы родителя (px-4 / sm:px-6). */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] flex-col items-center gap-2 sm:-mx-6 sm:w-[calc(100%+3rem)]">
          {/* Соперник: ник ← → часы (по разным краям доски) */}
          <MobileSeat
            name={topName}
            rank={topRank}
            present={topPresent}
            isMe={iAmPlayer && topColor === myColor}
            fen={viewedFen}
            capturedColor={topColor}
            clock={state.clock}
            side={topColor}
            clockMine={iAmPlayer && topColor === myColor}
            width={MOBILE_BOARD_SIDE}
          />

          {renderBoard(MOBILE_BOARD_SIDE)}

          {/* Я: ник ← → часы */}
          <MobileSeat
            name={bottomName}
            rank={bottomRank}
            present={bottomPresent}
            isMe={iAmPlayer && bottomColor === myColor}
            fen={viewedFen}
            capturedColor={bottomColor}
            clock={state.clock}
            side={bottomColor}
            clockMine={iAmPlayer && bottomColor === myColor}
            width={MOBILE_BOARD_SIDE}
          />
        </div>

        {/* Сразу под доской: результат партии (мат/пат/ничья) ИЛИ действия. */}
        {(resultPanel || actionRow || drawToast) && (
          <div className="mx-auto flex w-full flex-col gap-2" style={{ maxWidth: BOARD_SIDE }}>
            {resultPanel}
            {actionRow}
            {drawToast}
          </div>
        )}

        {/* Низ: таймер турнира + история ходов (слева) и чат (справа).
            < md — стопкой; md+ (планшет) — два столбца на всю ширину блока. */}
        <div className="grid w-full max-w-[820px] gap-2 md:grid-cols-2 md:items-start">
          <div className="flex flex-col gap-2">
            {tournament && (
              <TournamentCountdown
                status={tournament.status}
                startsAt={tournament.startsAt}
                endsAt={tournament.endsAt}
              />
            )}
            <div className="card !p-2">
              <MoveNav history={state.history} viewIdx={viewIdx} onSelect={setViewIdx} />
            </div>
            {errorBox}
          </div>
          <div className="h-[300px] md:h-[360px]">
            <ChatPanel variant="compact" messages={chatMessages} meId={meId} onSend={onChatSend} />
          </div>
        </div>
      </div>
    </>
  );
}

/** Видимый отсчёт 20 секунд на первый/ответный ход (как «First move» на Lichess). */
function FirstMoveTimer({ deadline, yourTurn }: { deadline: number; yourTurn: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold shadow-lg ${
        yourTurn
          ? secs <= 5
            ? 'animate-pulse bg-red-600 text-white'
            : 'bg-red-500 text-white'
          : 'bg-stone-800/90 text-stone-100'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2M9 2h6" strokeLinecap="round" />
      </svg>
      <span>
        {yourTurn ? 'Ваш ход' : 'Ход соперника'} · 0:{String(secs).padStart(2, '0')}
      </span>
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

/** Мобильная «строка игрока»: ник (с краю) и часы (у противоположного края доски). */
function MobileSeat({
  name,
  rank,
  present,
  isMe,
  fen,
  capturedColor,
  clock,
  side,
  clockMine,
  width,
}: {
  name: string;
  rank?: number;
  present: boolean;
  isMe?: boolean;
  fen: string;
  capturedColor: 'w' | 'b';
  clock: ClockState | null;
  side: 'w' | 'b';
  clockMine?: boolean;
  width: string;
}) {
  return (
    <div
      className="mx-auto flex w-full items-center justify-between gap-2 px-1"
      style={{ maxWidth: width }}
    >
      <div
        className={`flex min-w-0 flex-col gap-0.5 rounded-md px-1.5 py-0.5 ${
          isMe ? 'bg-brand-500/10' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
              present ? 'bg-emerald-500' : 'bg-stone-400 dark:bg-stone-600'
            }`}
            title={present ? 'За доской' : 'Вне доски'}
          />
          <span
            className={`truncate text-base font-semibold ${
              isMe ? 'text-brand-700 dark:text-brand-300' : ''
            }`}
          >
            {name}
          </span>
          {rank ? (
            <span className="flex-shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
              #{rank}
            </span>
          ) : null}
        </div>
        <MaterialBar fen={fen} color={capturedColor} compact />
      </div>
      {clock && <ClockDisplay clock={clock} side={side} isMine={clockMine} />}
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
  onReturn,
  onPause,
}: {
  result: NonNullable<ReturnType<typeof useRoomSocket>['state']>['result'];
  myColor: 'w' | 'b' | null;
  onReturn: () => void;
  onPause: () => void;
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
  // Текст исхода без имён: «Чёрные сдались — победа белых», «Белые просрочили
  // время — победа чёрных», «Мат — победа белых», «Пат — ничья» и т.п.
  const winnerGen = result.outcome === 'white' ? 'белых' : 'чёрных';
  const loserSubj = result.outcome === 'white' ? 'Чёрные' : 'Белые';
  let headline: string;
  if (result.outcome === 'draw') {
    headline =
      result.reason === 'stalemate'
        ? 'Пат — ничья'
        : result.reason === 'threefold'
          ? 'Троекратное повторение — ничья'
          : result.reason === 'insufficient-material'
            ? 'Недостаточно материала — ничья'
            : result.reason === 'fifty-move'
              ? 'Правило 50 ходов — ничья'
              : result.reason === 'draw-agreement'
                ? 'Ничья по соглашению'
                : 'Ничья';
  } else {
    headline =
      result.reason === 'resignation'
        ? `${loserSubj} сдались — победа ${winnerGen}`
        : result.reason === 'timeout'
          ? `${loserSubj} просрочили время — победа ${winnerGen}`
          : result.reason === 'checkmate'
            ? `Мат — победа ${winnerGen}`
            : `Победа ${winnerGen}`;
  }

  return (
    <div
      className={`card !p-2 text-center text-sm ${
        myOutcome === 'win'
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
          : myOutcome === 'loss'
            ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30'
            : ''
      }`}
    >
      <div className="mb-1.5 text-sm font-semibold leading-snug">{headline}</div>
      <div className="flex flex-col gap-1.5">
        <button onClick={onReturn} className="btn-primary w-full !py-1.5">
          Следующая партия
        </button>
        <button onClick={onPause} className="btn-ghost w-full !py-1.5">
          Приостановить
        </button>
      </div>
    </div>
  );
}
