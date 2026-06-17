'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/chess/ChessBoard';
import {
  addSolved,
  getBestStreak,
  getSolvedIds,
  saveBestStreak,
} from '@/lib/training-progress';

interface PuzzleDto {
  id: string;
  fen: string;
  moves: string;
  rating: number;
}

/** intro — показываем позицию и ждём «ход соперника»;
 *  solving — ждём ход игрока; opponent — анимируем ответ соперника. */
type Phase = 'loading' | 'intro' | 'solving' | 'opponent' | 'wrong' | 'solved' | 'empty';

export function TrainerClient({ category, title }: { category: string; title: string }) {
  const [puzzle, setPuzzle] = useState<PuzzleDto | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stepIdx, setStepIdx] = useState(1);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const gameRef = useRef<Chess | null>(null);
  /** Инвалидация отложенных колбэков при переходе к новой задаче. */
  const epochRef = useRef(0);

  const applyUci = useCallback((game: Chess, uci: string) => {
    const mv = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] ?? 'q',
    });
    setFen(game.fen());
    if (mv) setLastMove({ from: mv.from, to: mv.to });
  }, []);

  const loadNext = useCallback(
    async (excludeId: string | null) => {
      epochRef.current++;
      const epoch = epochRef.current;
      setPhase('loading');
      setHint(null);
      setLastMove(null);

      let data: { puzzle: PuzzleDto; total: number };
      try {
        const res = await fetch(
          `/api/training/next?cat=${category}${excludeId ? `&not=${encodeURIComponent(excludeId)}` : ''}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        data = await res.json();
      } catch {
        if (epochRef.current === epoch) setPhase('empty');
        return;
      }
      if (epochRef.current !== epoch) return;

      const game = new Chess(data.puzzle.fen);
      // Игрок ходит ПОСЛЕ хода соперника, поэтому его цвет — противоположный
      // тому, чья очередь в исходном FEN.
      const color = game.turn() === 'w' ? 'b' : 'w';

      // Показываем ИСХОДНУЮ позицию (до хода соперника), затем с паузой
      // анимированно делаем ход соперника — чтобы ученик видел, что именно
      // сходил соперник. Никакого «холостого» хода своего цвета.
      gameRef.current = game;
      setPuzzle(data.puzzle);
      setTotalCount(data.total);
      setFen(data.puzzle.fen);
      setPlayerColor(color);
      setLastMove(null);
      setStepIdx(1);
      setPhase('intro');

      // Ход соперника проигрывается чуть позже — после ремоунта доски на новой
      // задаче (key={puzzle.id}), чтобы смена fen дала анимацию хода, а не «слайд».
      setTimeout(() => {
        if (epochRef.current !== epoch) return;
        const g = gameRef.current;
        if (!g) return;
        const firstUci = data.puzzle.moves.split(' ')[0];
        const firstMove = g.move({
          from: firstUci.slice(0, 2),
          to: firstUci.slice(2, 4),
          promotion: firstUci[4] ?? 'q',
        });
        setFen(g.fen());
        setLastMove(firstMove ? { from: firstMove.from, to: firstMove.to } : null);
        setPhase('solving');
      }, 550);
    },
    [category],
  );

  useEffect(() => {
    setSolvedCount(getSolvedIds(category).length);
    setBestStreak(getBestStreak());
    void loadNext(null);
  }, [category, loadNext]);

  function onSolved(p: PuzzleDto) {
    setPhase('solved');
    setSolvedCount(addSolved(category, p.id));
    const next = streak + 1;
    setStreak(next);
    saveBestStreak(next);
    setBestStreak((b) => Math.max(b, next));

    const epoch = epochRef.current;
    setTimeout(() => {
      if (epochRef.current === epoch) void loadNext(p.id);
    }, 1400);
  }

  function handleMove(m: { from: string; to: string; promotion?: string }) {
    if (phase !== 'solving' || !puzzle) return;
    const game = gameRef.current;
    if (!game) return;

    const moves = puzzle.moves.split(' ');
    const expected = moves[stepIdx];

    let mv;
    try {
      mv = game.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
    } catch {
      return;
    }
    if (!mv) return;

    setFen(game.fen());
    setLastMove({ from: mv.from, to: mv.to });
    setHint(null);

    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const isExpected = uci === expected;

    // Как на Lichess: любой ход, который ставит мат, тоже засчитывается.
    if (isExpected || game.isCheckmate()) {
      if (!isExpected || stepIdx === moves.length - 1) {
        onSolved(puzzle);
        return;
      }
      // Верный промежуточный ход — соперник отвечает по линии решения.
      setPhase('opponent');
      const epoch = epochRef.current;
      setTimeout(() => {
        if (epochRef.current !== epoch) return;
        applyUci(game, moves[stepIdx + 1]);
        setStepIdx(stepIdx + 2);
        setPhase('solving');
      }, 450);
      return;
    }

    // Неверный ход: откатываем и даём попробовать ещё раз.
    setPhase('wrong');
    setStreak(0);
    const epoch = epochRef.current;
    setTimeout(() => {
      if (epochRef.current !== epoch) return;
      game.undo();
      setFen(game.fen());
      setLastMove(null);
      setPhase('solving');
    }, 900);
  }

  function showHint() {
    if (phase !== 'solving' || !puzzle) return;
    const expected = puzzle.moves.split(' ')[stepIdx];
    if (expected) setHint(expected.slice(0, 2));
  }

  function skip() {
    if (!puzzle || phase === 'loading') return;
    setStreak(0);
    void loadNext(puzzle.id);
  }

  const sideName = playerColor === 'w' ? 'белых' : 'чёрных';
  const status = STATUS_BY_PHASE[phase] ?? STATUS_BY_PHASE.loading;

  // Размер доски — как в комнате (RoomClient): квадрат, ограниченный
  // минимумом из высоты окна (без шапки) и ширины (минус правая колонка),
  // с hard-cap 760px. Явный width обязателен — без него обёртка с
  // aspect-square схлопывается внутри flex-контейнера.
  const boardSizeCls =
    'relative aspect-square w-[min(96vw,480px)] lg:w-[min(94vw,calc(100dvh-5.5rem),calc(100vw-27rem),760px)]';

  return (
    <div className="flex flex-1 flex-col gap-3 lg:min-h-0 lg:flex-row lg:items-stretch lg:overflow-hidden">
      {/* ── Доска: центрируется в свободном пространстве слева ── */}
      <section className="flex min-h-0 flex-1 items-center justify-center">
        <div className={boardSizeCls}>
          {fen ? (
            <ChessBoard
              // key по задаче — чистый ремоунт без анимации «слайда» при
              // переходе к следующей задаче (новая позиция, не продолжение).
              key={puzzle?.id ?? 'none'}
              fen={fen}
              canMove={phase === 'solving'}
              isEditing={false}
              canEdit={false}
              flipped={playerColor === 'b'}
              sideLock={playerColor}
              onMove={handleMove}
              highlights={hint ? { from: hint } : (lastMove ?? undefined)}
              compact
              fillContainer
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl bg-stone-200/60 text-stone-400 dark:bg-stone-800/60">
              Загружаем задачу…
            </div>
          )}
        </div>
      </section>

      {/* ── Правая колонка: статус, кнопки, статистика ── */}
      <aside className="w-full shrink-0 space-y-3 pb-2 lg:w-[21rem] lg:min-h-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/learn"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            ← Все темы
          </Link>
          {puzzle && (
            <span className="badge bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              ★ {puzzle.rating}
            </span>
          )}
        </div>

        <div className="card">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
            Ход {sideName} — вы играете за {sideName}
          </p>

          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${status.cls}`}
            role="status"
          >
            {phase === 'solving'
              ? `Ход ${sideName}. Найдите лучший ход!`
              : status.text}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={showHint}
              disabled={phase !== 'solving'}
              className="btn-outline flex-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              💡 Подсказка
            </button>
            <button
              onClick={skip}
              disabled={phase === 'loading' || phase === 'empty'}
              className="btn-ghost flex-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              ⏭ Пропустить
            </button>
          </div>
        </div>

        <div className="card">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-semibold text-amber-500">
                🔥 {streak}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-stone-400">
                Серия
              </div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-stone-700 dark:text-stone-200">
                {bestStreak}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-stone-400">
                Рекорд
              </div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {solvedCount}
                <span className="text-sm font-normal text-stone-400">/{totalCount}</span>
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-stone-400">
                Решено
              </div>
            </div>
          </div>
        </div>

        <p className="px-1 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
          Решение проверяется по точной линии: найдите единственный сильнейший
          ход (любой мат тоже засчитывается). После верного решения следующая
          задача появится автоматически.
        </p>
      </aside>
    </div>
  );
}

const STATUS_BY_PHASE: Record<Phase, { text: string; cls: string }> = {
  loading: {
    text: 'Загружаем задачу…',
    cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  },
  intro: {
    text: 'Смотрите: ход соперника…',
    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
  },
  solving: {
    text: 'Найдите лучший ход!',
    cls: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  opponent: {
    text: '✓ Верно! Ответ соперника…',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  },
  wrong: {
    text: '✗ Не тот ход — попробуйте ещё раз',
    cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
  },
  solved: {
    text: '🎉 Решено! Следующая задача…',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100',
  },
  empty: {
    text: 'В этом блоке пока нет задач',
    cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  },
};
