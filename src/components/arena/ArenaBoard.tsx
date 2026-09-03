'use client';

// Партия арены. Разбита на две части, которые страница ставит в свои колонки:
// ArenaBoard — центр (имена, часы, доска), GameControls — правая колонка
// (подсказки, ничья/сдача, итог). Доска ограничена высотой экрана, поэтому
// вся партия помещается без прокрутки и ничего не налезает друг на друга.

import { useEffect, useState } from 'react';
import { Fire, Flag, Handshake } from '@phosphor-icons/react';

import { ChessBoard } from '@/components/chess/ChessBoard';
import { ClockDisplay } from '@/components/chess/ClockDisplay';
import { MaterialBar } from '@/components/chess/MaterialBar';
import { PromotionDialog } from '@/components/chess/PromotionDialog';
import { ToolButton } from '@/components/room/ui';
import type { ArenaGamePayload } from '@/lib/socket-events';
import { ARENA_POINTS } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

import { useNow } from './time';

/**
 * Доска не шире колонки и не выше экрана: вычитаем шапку сайта, строки
 * игроков и отступы. Благодаря этому партия видна целиком, без прокрутки.
 */
export const BOARD_SIZE_STYLE = { width: 'min(100%, calc(100dvh - 11rem))' } as const;

/**
 * Подсказка про первый ход со своим отсчётом. Вынесена из доски: иначе тик
 * раз в пятую секунды перерисовывал бы вместе с подписью и саму доску.
 */
function FirstMoveHint({ deadlineAt, mine }: { deadlineAt: number; mine: boolean }) {
  const now = useNow(250);
  const left = Math.max(0, Math.ceil((deadlineAt - now) / 1000));
  return (
    <p className="rounded-xl bg-amber-50 px-2.5 py-2 text-[12px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {mine
        ? `Сделайте первый ход, осталось ${left} с`
        : `Ждём первый ход соперника: ${left} с`}
    </p>
  );
}

const RESULT_TEXT: Record<string, string> = {
  checkmate: 'мат',
  stalemate: 'пат',
  resignation: 'сдался',
  timeout: 'время вышло',
  'draw-agreement': 'по согласию',
  'insufficient-material': 'не хватает материала для мата',
  threefold: 'троекратное повторение',
  'fifty-move': 'правило 50 ходов',
  'no-first-move': 'первый ход не сделан',
  other: '',
};

/** Однострочное описание итога партии. */
export function resultText(game: ArenaGamePayload): string {
  if (game.status === 'cancelled') return 'Партия отменена: первый ход не был сделан';
  const reason = game.result ? RESULT_TEXT[game.result.reason] : '';
  const tail = reason ? `, ${reason}` : '';
  if (game.status === 'draw') return `Ничья${tail}`;
  if (game.status === 'white') return `Победа ${game.whiteName}${tail}`;
  if (game.status === 'black') return `Победа ${game.blackName}${tail}`;
  return 'Партия идёт';
}

/** Имя, огонёк серии и часы одной стороны. */
function PlayerLine({
  name,
  streak,
  side,
  clock,
  fen,
  startFen,
  isMe,
}: {
  name: string;
  streak: number;
  side: 'w' | 'b';
  clock: ArenaGamePayload['clock'];
  fen: string;
  startFen: string;
  isMe: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'h-3 w-3 shrink-0 rounded-sm ring-1',
          side === 'w'
            ? 'bg-white ring-stone-400 dark:bg-stone-100'
            : 'bg-stone-800 ring-stone-600 dark:bg-stone-900',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-[13px]',
              isMe
                ? 'font-semibold text-brand-800 dark:text-brand-100'
                : 'font-medium text-stone-800 dark:text-stone-100',
            )}
          >
            {name}
          </span>
          {streak >= ARENA_POINTS.streakFrom && (
            <span
              title={`${streak} победы подряд`}
              className="inline-flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400"
            >
              <Fire size={13} weight="fill" aria-hidden />
              <span className="text-[11px] font-semibold tabular-nums">{streak}</span>
            </span>
          )}
        </span>
        <MaterialBar fen={fen} startFen={startFen} color={side} compact className="mt-0.5" />
      </span>
      <ClockDisplay clock={clock} side={side} size="sm" isMine={isMe} />
    </div>
  );
}

interface BoardProps {
  game: ArenaGamePayload;
  meId: string | null;
  /** Какой ход смотрим; null — актуальная позиция. */
  viewIdx: number | null;
  onMove: (m: { from: string; to: string; promotion?: string }) => void;
}

/** Центральная колонка: соперник, доска, я. */
export function ArenaBoard({ game, meId, viewIdx, onMove }: BoardProps) {
  const myColor: 'w' | 'b' | null =
    meId === game.whiteId ? 'w' : meId === game.blackId ? 'b' : null;
  const isPlayer = myColor !== null;
  const live = game.status === 'live';
  const turn = (game.fen.split(' ')[1] ?? 'w') as 'w' | 'b';
  const reviewing = viewIdx !== null;
  const canMove = live && isPlayer && !reviewing && turn === myColor;

  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: 'w' | 'b';
  } | null>(null);

  // Незакрытый диалог превращения не должен перекочевать в следующую партию.
  useEffect(() => setPendingPromotion(null), [game.id]);

  const lastMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : null;
  const flipped = myColor === 'b';

    const shownFen =
      viewIdx === null
        ? game.fen
        : viewIdx < 0
          ? game.startFen
          : game.moves[viewIdx]?.fen ?? game.fen;
  const shownMove = viewIdx === null ? lastMove : game.moves[viewIdx];

  const top = flipped
    ? { name: game.whiteName, streak: game.whiteStreak, side: 'w' as const, id: game.whiteId }
    : { name: game.blackName, streak: game.blackStreak, side: 'b' as const, id: game.blackId };
  const bottom = flipped
    ? { name: game.blackName, streak: game.blackStreak, side: 'b' as const, id: game.blackId }
    : { name: game.whiteName, streak: game.whiteStreak, side: 'w' as const, id: game.whiteId };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <PlayerLine
        name={top.name}
        streak={top.streak}
        side={top.side}
        clock={game.clock}
        fen={game.fen}
        startFen={game.startFen}
        isMe={top.id === meId}
      />

      <div
        className="mx-auto aspect-square overflow-hidden rounded-xl ring-1 ring-stone-900/[0.07] dark:ring-white/[0.08]"
        style={BOARD_SIZE_STYLE}
      >
        <ChessBoard
          fen={shownFen}
          canMove={canMove}
          isEditing={false}
          canEdit={false}
          flipped={flipped}
          onPromotionRequest={(m) => {
            setPendingPromotion(m);
            return true;
          }}
          onMove={onMove}
          highlights={shownMove ? { from: shownMove.from, to: shownMove.to } : undefined}
          compact
          fillContainer
        />
      </div>

      <PlayerLine
        name={bottom.name}
        streak={bottom.streak}
        side={bottom.side}
        clock={game.clock}
        fen={game.fen}
        startFen={game.startFen}
        isMe={bottom.id === meId}
      />

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={(piece) => {
            onMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
            setPendingPromotion(null);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}

interface ControlsProps {
  game: ArenaGamePayload;
  meId: string | null;
  onResign: () => void;
  onOfferDraw: () => void;
  onAcceptDraw: () => void;
  onDeclineDraw: () => void;
}

/** Правая колонка: подсказка о первом ходе, ничья/сдача, итог партии. */
export function GameControls({
  game,
  meId,
  onResign,
  onOfferDraw,
  onAcceptDraw,
  onDeclineDraw,
}: ControlsProps) {
  const myColor: 'w' | 'b' | null =
    meId === game.whiteId ? 'w' : meId === game.blackId ? 'b' : null;
  const isPlayer = myColor !== null;
  const live = game.status === 'live';
  const turn = (game.fen.split(' ')[1] ?? 'w') as 'w' | 'b';

  const [confirmResign, setConfirmResign] = useState(false);

  // Новая партия — с чистыми кнопками: незакрытое подтверждение сдачи
  // не должно перекочевать в следующую партию.
  useEffect(() => setConfirmResign(false), [game.id]);

  const incomingOffer =
    live && game.drawOffer !== null && isPlayer && game.drawOffer.fromUserId !== meId;
  const myOfferPending =
    live && game.drawOffer !== null && isPlayer && game.drawOffer.fromUserId === meId;

  return (
    <div className="flex flex-col gap-2">
      {live && game.firstMoveDeadlineAt !== null && (
        <FirstMoveHint deadlineAt={game.firstMoveDeadlineAt} mine={turn === myColor} />
      )}

      {/* Соперника находит сам турнир, поэтому партия появляется на экране
          неожиданно: без явной подписи легко не заметить, что ход твой. */}
      {live && isPlayer && game.firstMoveDeadlineAt === null && (
        <p
          className={cn(
            'rounded-xl px-2.5 py-2 text-[13px] font-semibold',
            turn === myColor
              ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
              : 'bg-stone-900/[0.05] text-stone-600 dark:bg-white/[0.07] dark:text-stone-300',
          )}
        >
          {turn === myColor ? 'Ваш ход' : 'Ход соперника'}
        </p>
      )}

      {incomingOffer && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-2.5 py-2 dark:bg-brand-900/50">
          <span className="w-full text-[12px] font-medium text-brand-900 dark:text-brand-100">
            Соперник предлагает ничью
          </span>
          <ToolButton icon={Handshake} tone="primary" onClick={onAcceptDraw}>
            Согласиться
          </ToolButton>
          <ToolButton onClick={onDeclineDraw}>Отказаться</ToolButton>
        </div>
      )}

      {!live && (
        <p className="rounded-xl bg-stone-900/[0.05] px-2.5 py-2 text-[13px] font-semibold text-stone-700 dark:bg-white/[0.07] dark:text-stone-100">
          {resultText(game)}
        </p>
      )}

      {live && isPlayer && (
        // «Сдаться» стоит отдельно от «Ничьи» и требует подтверждения:
        // промах по этой кнопке стоит партии.
        <div className="flex flex-col gap-2">
          {confirmResign ? (
            <>
              <span className="text-[12px] font-medium text-stone-600 dark:text-stone-300">
                Точно сдаётесь?
              </span>
              <span className="flex items-center gap-2">
                <ToolButton onClick={() => setConfirmResign(false)}>Нет</ToolButton>
                <ToolButton icon={Flag} tone="danger" onClick={onResign}>
                  Сдаюсь
                </ToolButton>
              </span>
            </>
          ) : (
            <>
              <ToolButton
                icon={Handshake}
                onClick={onOfferDraw}
                disabled={myOfferPending}
                title={myOfferPending ? 'Предложение отправлено' : undefined}
              >
                {myOfferPending ? 'Ничья предложена' : 'Предложить ничью'}
              </ToolButton>
              <ToolButton icon={Flag} tone="quiet" onClick={() => setConfirmResign(true)}>
                Сдаться
              </ToolButton>
            </>
          )}
        </div>
      )}

      {live && !isPlayer && (
        <p className="text-center text-[12px] text-stone-500 dark:text-stone-400">
          Идёт партия. Ход {turn === 'w' ? 'белых' : 'чёрных'}
          {game.clock.running === null && game.moves.length === 0 ? ', первый ход' : ''}
        </p>
      )}
    </div>
  );
}
