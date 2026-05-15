'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Chess, type Square as ChessSquare } from 'chess.js';
import { PieceSvg, type PieceCode } from './PieceSvg';
import { cn } from '@/lib/utils';
import { parseFen, setPiece as setPieceFen, emptyFen, sideToMove as fenSideToMove } from '@/lib/fen';
import { allPseudoLegalDestinations } from '@/lib/pseudo-legal';
import { playCaptureSound, playMoveSound, unlockSounds } from '@/lib/sounds';
import type { BoardArrow, BoardMark, ArrowColor } from '@/lib/socket-events';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
type Sq = `${(typeof FILES)[number]}${(typeof RANKS)[number]}`;

export interface ChessBoardProps {
  fen: string;
  /** Можно ли делать ходы (валидация дублируется на сервере). */
  canMove: boolean;
  /** Включён ли режим редактора (палитра + удаление). */
  isEditing: boolean;
  /** Может ли пользователь редактировать (учитель / ученик с правами). */
  canEdit: boolean;
  /** Перевернуть доску для игры за чёрных. */
  flipped?: boolean;
  /** Разрешает любые ходы (без проверки правил). Подсказки легальных всё ещё показываются. */
  allowIllegal?: boolean;
  /** Если задан — пешка, дошедшая до 1/8 ряда, превращается через диалог.
   *  Без обработчика — превращение происходит автоматически в ферзя. */
  onPromotionRequest?: (move: { from: string; to: string; color: 'w' | 'b' }) => boolean;
  onMove?: (move: { from: string; to: string; promotion?: string }) => void;
  /** В edit-режиме приходит полный FEN. */
  onEditFen?: (fen: string) => void;
  /** Подсветка (последний ход / подсказка движка). */
  highlights?: { from?: string; to?: string };
  /** Стрелки и выделения клеток (общий слой; синхронизируется снаружи). */
  arrows?: BoardArrow[];
  marks?: BoardMark[];
  onAnnotationsChange?: (next: { arrows: BoardArrow[]; marks: BoardMark[] }) => void;
  /** Узкая рамка и отступы — визуально ближе к Lichess. */
  compact?: boolean;
  /** Родитель задаёт квадрат; поле растягивается на доступную высоту внутри колонки. */
  fillContainer?: boolean;
  className?: string;
  /** Отключить звук/анимацию (по умолчанию включено). */
  silent?: boolean;
}

const PIECE_PALETTE: PieceCode[] = (
  ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const
).map((s) => s.toLowerCase() as PieceCode);

interface DragState {
  from: 'board' | 'palette';
  square?: Sq;
  piece: PieceCode;
}

interface LastMove {
  from: Sq;
  to: Sq;
  captured: boolean;
  check: boolean;
  mate: boolean;
  /** Уникальный ключ — нужен, чтобы перезапускать CSS-анимацию при повторных ходах на ту же клетку. */
  key: number;
}

export function ChessBoard({
  fen,
  canMove,
  isEditing,
  canEdit,
  flipped = false,
  allowIllegal = false,
  onPromotionRequest,
  onMove,
  onEditFen,
  highlights,
  arrows = [],
  marks = [],
  onAnnotationsChange,
  compact = false,
  fillContainer = false,
  className,
  silent = false,
}: ChessBoardProps) {
  const [selected, setSelected] = useState<Sq | null>(null);
  const [legalMoves, setLegalMoves] = useState<Sq[]>([]);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const prevFenRef = useRef<string | null>(null);
  const animKeyRef = useRef(0);
  /** Sticky-фигура из палитры: выбранная мышью, остаётся «в курсоре» пока её не сменили. */
  const [paletteCursor, setPaletteCursor] = useState<PieceCode | null>(null);
  /** Активное рисование стрелки правой кнопкой: from-клетка + текущая клетка под курсором. */
  const [arrowDrag, setArrowDrag] = useState<{ from: Sq; to: Sq; color: ArrowColor } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Один раз — подписаться на жесты для разблокировки звука.
  useEffect(() => {
    if (!silent) unlockSounds();
  }, [silent]);

  // Пытаемся работать через chess.js (даёт легальные ходы); если позиция нелегальна
  // (например, во время редактирования) — fallback на безопасный парсер.
  const game = useMemo<Chess | null>(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const fenBoard = useMemo(() => parseFen(fen).board, [fen]);

  // Сброс выделения и подсказок при смене позиции
  useEffect(() => {
    setSelected(null);
    setLegalMoves([]);
  }, [fen]);

  // При входе/выходе из режима редактирования сбрасываем подсветку последнего хода.
  useEffect(() => {
    if (isEditing) setLastMove(null);
    if (!isEditing) setPaletteCursor(null);
  }, [isEditing]);

  // Escape — снимает sticky-фигуру / отменяет рисование стрелки / снимает выделение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (paletteCursor) setPaletteCursor(null);
      if (arrowDrag) setArrowDrag(null);
      if (selected) {
        setSelected(null);
        setLegalMoves([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteCursor, arrowDrag, selected]);

  // Детекция хода: ищем легальный ход из prevFen, который даёт текущий fen.
  // useLayoutEffect, чтобы новая подсветка/анимация попала в тот же кадр и не «мигало».
  useLayoutEffect(() => {
    const prev = prevFenRef.current;
    prevFenRef.current = fen;
    if (!prev || prev === fen || isEditing) return;

    let found: { from: Sq; to: Sq; captured: boolean } | null = null;
    try {
      const probeBase = new Chess(prev);
      const moves = probeBase.moves({ verbose: true }) as Array<{
        from: string;
        to: string;
        promotion?: string;
        captured?: string;
      }>;
      for (const m of moves) {
        const probe = new Chess(prev);
        try {
          probe.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
        } catch {
          continue;
        }
        if (probe.fen() === fen) {
          found = { from: m.from as Sq, to: m.to as Sq, captured: !!m.captured };
          break;
        }
      }
    } catch {
      // ignore
    }
    if (!found) return;

    let check = false;
    let mate = false;
    try {
      const g2 = new Chess(fen);
      check = g2.isCheck();
      mate = g2.isCheckmate();
    } catch {
      // ignore
    }

    animKeyRef.current += 1;
    setLastMove({ ...found, check, mate, key: animKeyRef.current });

    if (!silent) {
      if (found.captured) playCaptureSound();
      else playMoveSound();
    }
  }, [fen, isEditing, silent]);

  const orderedRanks = flipped ? [...RANKS].reverse() : RANKS;
  const orderedFiles = flipped ? [...FILES].reverse() : FILES;

  function visualOf(sq: Sq): { col: number; row: number } {
    const file = FILES.indexOf(sq[0] as (typeof FILES)[number]);
    const rank = Number(sq.slice(1)) as (typeof RANKS)[number];
    const rowIdx = RANKS.indexOf(rank);
    return flipped ? { col: 7 - file, row: 7 - rowIdx } : { col: file, row: rowIdx };
  }

  // Клетка короля под шахом / в мате (для красной подсветки)
  const checkSquare = useMemo<Sq | null>(() => {
    if (!game || !game.isCheck()) return null;
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) {
          return `${FILES[c]}${(8 - r) as (typeof RANKS)[number]}` as Sq;
        }
      }
    }
    return null;
  }, [game]);

  const isMate = useMemo<boolean>(() => {
    if (!game) return false;
    try {
      return game.isCheckmate();
    } catch {
      return false;
    }
  }, [game]);

  function pieceAt(sq: Sq): PieceCode | null {
    if (game) {
      const p = game.get(sq as ChessSquare);
      if (!p) return null;
      return `${p.color}${p.type}` as PieceCode;
    }
    const file = FILES.indexOf(sq[0] as (typeof FILES)[number]);
    const rank = Number(sq.slice(1));
    const row = 8 - rank;
    return fenBoard[row]?.[file] ?? null;
  }

  function getLegalMoves(sq: Sq): Sq[] {
    return allPseudoLegalDestinations(fen, sq).map((t) => t as Sq);
  }

  function pieceSelectable(pc: PieceCode | null): boolean {
    if (!pc) return false;
    if (!allowIllegal && fenSideToMove(fen) !== pc[0]) return false;
    return true;
  }

  /** Попытка хода с учётом promotion: возвращает true, если ход «съели» (отправили или открыли диалог). */
  function attemptMove(from: Sq, to: Sq): boolean {
    if (!onMove) return false;
    const piece = pieceAt(from);
    if (!piece) return false;
    const targetRank = Number(to[1]);
    const isPawn = piece[1] === 'p';
    const promotes =
      isPawn && ((piece[0] === 'w' && targetRank === 8) || (piece[0] === 'b' && targetRank === 1));
    if (promotes && onPromotionRequest) {
      // Диалог откроет внешний компонент — он сам потом вызовет onMove.
      const handled = onPromotionRequest({ from, to, color: piece[0] as 'w' | 'b' });
      if (handled) return true;
    }
    onMove({ from, to, promotion: 'q' });
    return true;
  }

  function onSquareClick(sq: Sq) {
    if (isEditing) {
      if (!canEdit) return;
      // Sticky-фигура: один раз кликнул в палитре → этой фигурой расставляем
      // по доске множество клеток подряд. Чтобы снять — кликнуть в палитре
      // на ту же фигуру или нажать Escape.
      if (paletteCursor) {
        onEditFen?.(setPieceFen(fen, sq, paletteCursor));
      }
      return;
    }
    if (!canMove) return;
    const piece = pieceAt(sq);

    if (selected) {
      if (selected === sq) {
        setSelected(null);
        setLegalMoves([]);
        return;
      }
      // Если включён вольный режим — разрешаем любой ход; иначе только из подсказок.
      if (allowIllegal || legalMoves.includes(sq)) {
        attemptMove(selected, sq);
        setSelected(null);
        setLegalMoves([]);
        return;
      }
    }

    if (piece) {
      if (!pieceSelectable(piece)) {
        setSelected(null);
        setLegalMoves([]);
        return;
      }
      setSelected(sq);
      setLegalMoves(getLegalMoves(sq));
    } else {
      setSelected(null);
      setLegalMoves([]);
    }
  }

  function onDragStart(e: DragEvent, sq: Sq) {
    const piece = pieceAt(sq);
    if (!piece) return;
    if (isEditing) {
      if (!canEdit) return;
      // В редакторе перетаскивать любые фигуры (в том числе для удаления через
      // палитру-«корзину»), без оглядки на очередь хода или sideLock.
    } else {
      if (!canMove) return;
      if (!pieceSelectable(piece)) return;
    }
    dragRef.current = { from: 'board', square: sq, piece };
    // В редакторе разрешаем и copy, и move — браузер строго следит за совпадением
    // effectAllowed/dropEffect. Если их не согласовать, drop отменяется.
    e.dataTransfer.effectAllowed = isEditing ? 'copyMove' : 'move';
    e.dataTransfer.setData('text/plain', `${piece}@${sq}`);
  }

  function onPaletteDragStart(e: DragEvent, piece: PieceCode) {
    if (!isEditing || !canEdit) return;
    dragRef.current = { from: 'palette', piece };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', piece);
  }

  function onSquareDragOver(e: DragEvent) {
    const ds = dragRef.current;
    if (!ds) return;
    e.preventDefault();
    if (isEditing) {
      // В редакторе с доски — move, из палитры — copy.
      e.dataTransfer.dropEffect = ds.from === 'palette' ? 'copy' : 'move';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function onSquareDrop(e: DragEvent, target: Sq) {
    e.preventDefault();
    const ds = dragRef.current;
    dragRef.current = null;
    if (!ds) return;

    if (isEditing) {
      if (!canEdit) return;
      // В редакторе можно бросать фигуру на любую клетку, в том числе
      // на занятую — она просто заменит того, кто там стоял.
      let next = fen;
      if (ds.from === 'board' && ds.square) {
        if (ds.square === target) return;
        next = setPieceFen(next, ds.square, null);
      }
      next = setPieceFen(next, target, ds.piece);
      onEditFen?.(next);
      return;
    }

    if (!canMove || ds.from !== 'board' || !ds.square) return;
    if (ds.square === target) return;

    if (allowIllegal || getLegalMoves(ds.square).includes(target)) {
      attemptMove(ds.square, target);
    }
  }

  /** Drop в области палитры — удаляет фигуру с доски (запасные фигуры = «корзина»). */
  function onPaletteDragOver(e: DragEvent) {
    if (!isEditing || !canEdit) return;
    if (!dragRef.current || dragRef.current.from !== 'board') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onPaletteDrop(e: DragEvent) {
    e.preventDefault();
    const ds = dragRef.current;
    dragRef.current = null;
    if (!ds || !isEditing || !canEdit) return;
    if (ds.from !== 'board' || !ds.square) return;
    onEditFen?.(setPieceFen(fen, ds.square, null));
  }

  function clearBoard() {
    if (!canEdit) return;
    onEditFen?.(emptyFen());
  }

  // -------------------- Стрелки и выделения (ПКМ) --------------------

  /** Определяет клетку по координатам мыши в области доски. */
  function squareFromPoint(clientX: number, clientY: number): Sq | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const col = Math.min(7, Math.max(0, Math.floor((x / rect.width) * 8)));
    const row = Math.min(7, Math.max(0, Math.floor((y / rect.height) * 8)));
    const file = flipped ? FILES[7 - col] : FILES[col];
    const rank = (flipped ? RANKS[7 - row] : RANKS[row]) as (typeof RANKS)[number];
    return `${file}${rank}` as Sq;
  }

  function arrowColorFromEvent(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): ArrowColor {
    if (e.shiftKey) return 'green';
    if (e.altKey) return 'blue';
    if (e.ctrlKey || e.metaKey) return 'yellow';
    return 'red';
  }

  function onBoardPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 2) {
      // ПКМ → начинаем рисовать стрелку/маркер.
      const sq = squareFromPoint(e.clientX, e.clientY);
      if (!sq) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore — браузер может отказать на touch
      }
      setArrowDrag({ from: sq, to: sq, color: arrowColorFromEvent(e) });
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      // ЛКМ по любой клетке очищает стрелки и выделения (как в Lichess).
      if ((arrows.length > 0 || marks.length > 0) && onAnnotationsChange) {
        onAnnotationsChange({ arrows: [], marks: [] });
      }
    }
  }

  function onBoardPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!arrowDrag) return;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq || sq === arrowDrag.to) return;
    setArrowDrag({ ...arrowDrag, to: sq });
  }

  function commitArrowDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!arrowDrag) return;
    const end = squareFromPoint(e.clientX, e.clientY) ?? arrowDrag.to;
    const color = arrowColorFromEvent(e) ?? arrowDrag.color;
    setArrowDrag(null);

    if (!onAnnotationsChange) return;
    if (end === arrowDrag.from) {
      // Просто клик ПКМ по клетке — toggle выделения.
      const exists = marks.find((m) => m.square === end && m.color === color);
      const nextMarks = exists
        ? marks.filter((m) => !(m.square === end && m.color === color))
        : [...marks.filter((m) => m.square !== end), { square: end, color }];
      onAnnotationsChange({ arrows, marks: nextMarks });
      return;
    }
    // Перетаскивание ПКМ — toggle стрелки одного цвета между двумя клетками.
    const exists = arrows.find((a) => a.from === arrowDrag.from && a.to === end && a.color === color);
    const nextArrows = exists
      ? arrows.filter((a) => !(a.from === arrowDrag.from && a.to === end && a.color === color))
      : [
          ...arrows.filter((a) => !(a.from === arrowDrag.from && a.to === end)),
          { from: arrowDrag.from, to: end, color },
        ];
    onAnnotationsChange({ arrows: nextArrows, marks });
  }

  function onBoardPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 2 && arrowDrag) {
      commitArrowDrag(e);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
    }
  }

  function onBoardContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    // Контекстное меню только мешает рисованию стрелок.
    e.preventDefault();
  }

  // -------------------- Палитра / sticky-фигура --------------------

  function onPaletteClick(piece: PieceCode) {
    if (!canEdit) return;
    setPaletteCursor((cur) => (cur === piece ? null : piece));
  }

  /** В комнате палитра слева от доски в потоке не участвует — доска остаётся на месте. */
  const paletteAside = isEditing && compact && fillContainer;

  return (
    <div
      className={cn(
        'flex w-full',
        paletteAside ? 'relative h-full w-full min-h-0' : 'flex-col',
        !paletteAside && (compact ? 'gap-2' : 'gap-4'),
        fillContainer && !paletteAside && 'h-full min-h-0',
        className,
      )}
    >
      {isEditing && (
        <div
          onDragOver={onPaletteDragOver}
          onDrop={onPaletteDrop}
          className={cn(
            'border border-amber-300/60 bg-amber-50/70 text-amber-900 shadow-soft dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100',
            compact ? 'rounded-lg p-2 text-xs' : 'rounded-2xl p-3',
            paletteAside &&
              'absolute right-full top-0 z-30 mr-2 max-h-full w-[6.75rem] overflow-y-auto sm:w-[7.5rem]',
            !paletteAside && fillContainer && 'max-h-[38%] shrink-0 overflow-y-auto',
          )}
        >
          <div className={cn(compact ? 'mb-1 text-[11px] font-medium leading-snug' : 'mb-2 text-sm font-medium')}>
            {canEdit
              ? 'Перетаскивайте фигуры. Чтобы убрать — перетащите обратно сюда, в запасные.'
              : 'Учитель редактирует позицию — вы видите изменения в реальном времени.'}
          </div>
          {canEdit && (
            <>
              <div
                className={cn(
                  'grid gap-1 rounded-xl bg-white/60 dark:bg-stone-900/40',
                  paletteAside ? 'grid-cols-2 p-1.5' : cn('grid-cols-12', compact ? 'p-1.5' : 'p-2'),
                )}
              >
                {PIECE_PALETTE.map((p) => {
                  const active = paletteCursor === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      draggable
                      onDragStart={(e) => onPaletteDragStart(e, p)}
                      onClick={() => onPaletteClick(p)}
                      className={cn(
                        'flex aspect-square cursor-grab items-center justify-center rounded-lg transition',
                        active
                          ? 'bg-brand-500/90 text-white shadow-glow ring-2 ring-brand-300'
                          : 'bg-stone-100 hover:bg-brand-100 dark:bg-stone-800 dark:hover:bg-brand-900/40',
                      )}
                      title={
                        active
                          ? 'Нажмите ещё раз, чтобы отменить выбор'
                          : `Кликните, затем расставляйте по клеткам (или перетащите)`
                      }
                    >
                      <PieceSvg
                        code={p}
                        className={
                          paletteAside
                            ? 'h-5 w-5'
                            : compact
                              ? 'h-5 w-5 sm:h-6 sm:w-6'
                              : 'h-7 w-7'
                        }
                      />
                    </button>
                  );
                })}
              </div>
              {paletteCursor && (
                <div className="mt-1 rounded-md bg-brand-100/70 px-2 py-1 text-[10px] text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
                  Расставляйте {paletteCursor.toUpperCase()} кликами. Esc — отменить.
                </div>
              )}
              <button onClick={clearBoard} className="btn-ghost mt-2 w-full text-xs">
                Очистить доску
              </button>
            </>
          )}
        </div>
      )}

      <div
        className={cn(
          'relative overflow-hidden border border-brand-200/60 bg-brand-50/60 shadow-soft dark:border-stone-700/60 dark:bg-stone-900/40',
          paletteAside && 'h-full w-full',
          fillContainer && !paletteAside && 'min-h-0 flex-1',
          !paletteAside && !fillContainer && 'aspect-square w-full',
          compact ? 'rounded-lg p-1 sm:p-1.5' : 'rounded-2xl p-3',
        )}
      >
        <div
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onContextMenu={onBoardContextMenu}
          className={cn(
            'relative grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden touch-none',
            compact ? 'rounded-md' : 'rounded-xl',
          )}
        >
          <ArrowsOverlay
            arrows={arrows}
            marks={marks}
            activeDrag={arrowDrag}
            flipped={flipped}
          />
          {orderedRanks.map((rank) =>
            orderedFiles.map((file) => {
              const sq = `${file}${rank}` as Sq;
              const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
              const piece = pieceAt(sq);
              const isSelected = selected === sq;
              const isLegal = legalMoves.includes(sq);
              const isHl = highlights?.from === sq || highlights?.to === sq;
              const isLastFromOrTo = lastMove !== null && (lastMove.from === sq || lastMove.to === sq);
              const isCheckHere = checkSquare === sq;
              const isMateHere = isMate && checkSquare === sq;

              // Анимация фигуры, прибывшей на эту клетку.
              const isAnimDest = !!piece && lastMove?.to === sq;
              let animStyle: CSSProperties | undefined;
              if (isAnimDest && lastMove) {
                const v1 = visualOf(lastMove.from);
                const v2 = visualOf(lastMove.to);
                const dx = (v1.col - v2.col) * 100;
                const dy = (v1.row - v2.row) * 100;
                animStyle = {
                  ['--anim-dx' as string]: `${dx}%`,
                  ['--anim-dy' as string]: `${dy}%`,
                } as CSSProperties;
              }

              return (
                <div
                  key={sq}
                  onClick={() => onSquareClick(sq)}
                  onDragOver={onSquareDragOver}
                  onDrop={(e) => onSquareDrop(e, sq)}
                  className={cn(
                    'relative flex select-none items-center justify-center transition-colors',
                    isLight ? 'chess-square-light' : 'chess-square-dark',
                    isHl && 'chess-square-hl',
                    isSelected && 'chess-square-sel',
                  )}
                >
                  {/* Зелёная подсветка «откуда → куда» (поверх клетки, под фигурой) */}
                  {isLastFromOrTo && (
                    <span className="cell-last pointer-events-none absolute inset-0 z-[1]" />
                  )}
                  {/* Красная подсветка шаха / мата */}
                  {(isCheckHere || isMateHere) && (
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-0 z-[2]',
                        isMateHere ? 'cell-mate' : 'cell-check',
                      )}
                    />
                  )}

                  {/* Координаты */}
                  {file === orderedFiles[0] && (
                    <span
                      className={cn(
                        'pointer-events-none absolute z-[3] font-medium',
                        compact ? 'left-0.5 top-px text-[8px] sm:text-[9px]' : 'left-1 top-0.5 text-[10px]',
                        isLight ? 'text-brand-700/80' : 'text-brand-50/80',
                      )}
                    >
                      {rank}
                    </span>
                  )}
                  {rank === orderedRanks[orderedRanks.length - 1] && (
                    <span
                      className={cn(
                        'pointer-events-none absolute z-[3] font-medium',
                        compact ? 'bottom-px right-0.5 text-[8px] sm:text-[9px]' : 'bottom-0.5 right-1 text-[10px]',
                        isLight ? 'text-brand-700/80' : 'text-brand-50/80',
                      )}
                    >
                      {file}
                    </span>
                  )}

                  {/* Подсказка ходов */}
                  {isLegal && !piece && (
                    <span className="pointer-events-none z-[3] h-3 w-3 rounded-full bg-stone-900/35" />
                  )}
                  {isLegal && piece && (
                    <span className="pointer-events-none absolute inset-1 z-[3] rounded-full ring-4 ring-stone-900/30" />
                  )}

                  {/* Фигура (анимация — на обёртке во весь размер клетки) */}
                  {piece && (
                    <div
                      key={isAnimDest && lastMove ? `anim-${lastMove.key}` : 'static'}
                      className={cn(
                        'absolute inset-0 z-[4] flex items-center justify-center',
                        isAnimDest && 'piece-anim',
                      )}
                      style={animStyle}
                    >
                      <div
                        draggable={isEditing ? canEdit : canMove}
                        onDragStart={(e) => onDragStart(e, sq)}
                        className="relative h-[88%] w-[88%] cursor-grab"
                        style={{ filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.25))' }}
                      >
                        <PieceSvg code={piece} className="h-full w-full" />
                      </div>
                    </div>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Стрелки и выделения (SVG-overlay поверх 8×8 сетки). Координаты в %.
// ============================================================================

const ARROW_HEX: Record<ArrowColor, string> = {
  green: '#15803d',
  red: '#dc2626',
  blue: '#1d4ed8',
  yellow: '#ca8a04',
};

function ArrowsOverlay({
  arrows,
  marks,
  activeDrag,
  flipped,
}: {
  arrows: BoardArrow[];
  marks: BoardMark[];
  activeDrag: { from: string; to: string; color: ArrowColor } | null;
  flipped: boolean;
}) {
  function center(sq: string): { x: number; y: number } | null {
    const file = sq[0];
    const rank = Number(sq.slice(1));
    const col = FILES.indexOf(file as (typeof FILES)[number]);
    const row = RANKS.indexOf(rank as (typeof RANKS)[number]);
    if (col < 0 || row < 0) return null;
    const visCol = flipped ? 7 - col : col;
    const visRow = flipped ? 7 - row : row;
    // Центр клетки в процентах (каждая клетка = 12.5% × 12.5%).
    return { x: visCol * 12.5 + 6.25, y: visRow * 12.5 + 6.25 };
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
    >
      <defs>
        {(Object.keys(ARROW_HEX) as ArrowColor[]).map((c) => (
          <marker
            key={c}
            id={`arrow-head-${c}`}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={ARROW_HEX[c]} />
          </marker>
        ))}
      </defs>

      {/* Выделения клеток — рамка-обводка по периметру клетки. */}
      {marks.map((m, i) => {
        const c = center(m.square);
        if (!c) return null;
        return (
          <rect
            key={`mark-${i}-${m.square}-${m.color}`}
            x={c.x - 6.25 + 0.5}
            y={c.y - 6.25 + 0.5}
            width={12.5 - 1}
            height={12.5 - 1}
            rx={1.2}
            fill="none"
            stroke={ARROW_HEX[m.color]}
            strokeWidth={1.4}
            opacity={0.85}
          />
        );
      })}

      {/* Финальные стрелки. */}
      {arrows.map((a, i) => (
        <ArrowLine key={`arrow-${i}-${a.from}-${a.to}-${a.color}`} arrow={a} center={center} />
      ))}

      {/* Превью текущей стрелки во время ПКМ-drag. */}
      {activeDrag && activeDrag.from !== activeDrag.to && (
        <ArrowLine arrow={activeDrag as BoardArrow} center={center} opacity={0.55} />
      )}
    </svg>
  );
}

function ArrowLine({
  arrow,
  center,
  opacity = 0.85,
}: {
  arrow: BoardArrow;
  center: (sq: string) => { x: number; y: number } | null;
  opacity?: number;
}) {
  const a = center(arrow.from);
  const b = center(arrow.to);
  if (!a || !b) return null;
  // Слегка укорачиваем линию у наконечника, чтобы стрелка не перекрывала фигуру.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const shrink = 3; // ≈ четверть клетки
  const ratio = Math.max(0, (len - shrink) / len);
  const endX = a.x + dx * ratio;
  const endY = a.y + dy * ratio;
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={endX}
      y2={endY}
      stroke={ARROW_HEX[arrow.color]}
      strokeWidth={1.8}
      strokeLinecap="round"
      opacity={opacity}
      markerEnd={`url(#arrow-head-${arrow.color})`}
    />
  );
}
