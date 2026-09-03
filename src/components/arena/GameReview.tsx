'use client';

// Разбор сыгранной партии: центральная колонка с доской без возможности
// ходить. Перемотка ходов живёт в правой колонке страницы (MoveNav), состояние
// viewIdx приходит сверху, чтобы доска и список ходов были синхронны.
// Ходы приходят из базы списком, поэтому партию можно посмотреть и через
// неделю после турнира, а не только пока сервер помнит её в памяти.

import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ArenaGamePayload } from '@/lib/socket-events';

import { BOARD_SIZE_STYLE, resultText } from './ArenaBoard';

export function GameReview({
  game,
  viewIdx,
}: {
  game: ArenaGamePayload;
  /** Какой ход смотрим; null — итоговая позиция. */
  viewIdx: number | null;
}) {
  const shownFen =
    viewIdx === null
      ? game.fen
      : viewIdx < 0
        ? game.startFen
        : game.moves[viewIdx]?.fen ?? game.fen;
  const shownMove = viewIdx === null ? game.moves[game.moves.length - 1] : game.moves[viewIdx];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">
          {game.whiteName} и {game.blackName}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
          {game.moves.length} ходов
        </span>
      </div>

      <div
        className="mx-auto aspect-square overflow-hidden rounded-xl ring-1 ring-stone-900/[0.07] dark:ring-white/[0.08]"
        style={BOARD_SIZE_STYLE}
      >
        <ChessBoard
          fen={shownFen}
          canMove={false}
          isEditing={false}
          canEdit={false}
          highlights={shownMove ? { from: shownMove.from, to: shownMove.to } : undefined}
          compact
          fillContainer
          silent
        />
      </div>

      <p className="text-[12px] font-medium text-stone-600 dark:text-stone-300">
        {resultText(game)}
      </p>
    </div>
  );
}
