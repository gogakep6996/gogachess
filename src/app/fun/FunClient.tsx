'use client';

/**
 * «Развлекательные шахматы» — детский режим: армия Света против армии Тьмы.
 * Игра против Stockfish с «сказочными» уровнями-противниками, боевые анимации
 * взятий на 2.5D-доске (FunBoard) и синтезированные звуки ударов (fun-sounds).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { FunBoard, type FunAnimSpeed, type FunLastMove } from '@/components/fun/FunBoard';
import { useStockfish } from '@/hooks/useStockfish';
import { playFunVictory, playFunDefeat } from '@/lib/fun-sounds';
import { cn } from '@/lib/utils';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Сказочные уровни сложности вместо сухих чисел Stockfish. */
const OPPONENTS = [
  { id: 0, name: 'Скелетик-новичок', emoji: '💀', skill: 0, movetime: 350 },
  { id: 1, name: 'Злой гном', emoji: '🔨', skill: 2, movetime: 500 },
  { id: 2, name: 'Некромант', emoji: '🧙', skill: 5, movetime: 700 },
  { id: 3, name: 'Рыцарь смерти', emoji: '🐴', skill: 9, movetime: 900 },
  { id: 4, name: 'Королева демонов', emoji: '😈', skill: 14, movetime: 1100 },
  { id: 5, name: 'Тёмный владыка', emoji: '👑', skill: 20, movetime: 1500 },
] as const;

type GameOver = { result: 'win' | 'loss' | 'draw'; text: string } | null;

export function FunClient() {
  const [fen, setFen] = useState(STARTING_FEN);
  const [lastMove, setLastMove] = useState<FunLastMove | null>(null);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [opponentId, setOpponentId] = useState(1);
  const [gameOver, setGameOver] = useState<GameOver>(null);
  const [started, setStarted] = useState(false);
  const [tiltOn, setTiltOn] = useState(true);
  const [animSpeed, setAnimSpeed] = useState<FunAnimSpeed>('normal');
  const [soundOn, setSoundOn] = useState(true);
  const [captured, setCaptured] = useState<{ w: string[]; b: string[] }>({ w: [], b: [] });
  const moveSeqRef = useRef(0);

  const engine = useStockfish();
  const opponent = OPPONENTS[opponentId];

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const sideToMove = game.turn();
  const engineColor: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
  const playersTurn = started && !gameOver && sideToMove === playerColor;

  useEffect(() => {
    if (engine.ready) engine.setSkill(opponent.skill);
  }, [engine.ready, opponent.skill, engine]);

  /** Общее применение хода (игрока или движка). */
  const applyMove = useCallback(
    (m: { from: string; to: string; promotion?: string }) => {
      try {
        const next = new Chess(fen);
        const result = next.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
        if (!result) return;
        const mate = next.isCheckmate();
        moveSeqRef.current += 1;
        setLastMove({
          from: result.from,
          to: result.to,
          piece: result.piece,
          color: result.color,
          captured: result.captured,
          flags: result.flags,
          check: next.isCheck(),
          mate,
          seq: moveSeqRef.current,
        });
        if (result.captured) {
          const victimColor = result.color === 'w' ? 'b' : 'w';
          setCaptured((c) => ({ ...c, [victimColor]: [...c[victimColor], result.captured as string] }));
        }
        setFen(next.fen());

        // Итог партии — с задержкой, чтобы боевая сцена успела доиграть.
        if (next.isGameOver()) {
          const finish = () => {
            if (mate) {
              const winner = result.color;
              if (winner === playerColor) {
                setGameOver({
                  result: 'win',
                  text: playerColor === 'w' ? 'Победа! Армия Тьмы повержена!' : 'Победа! Армия Света повержена!',
                });
                if (soundOn) playFunVictory();
              } else {
                setGameOver({ result: 'loss', text: 'Поражение… Но настоящий герой пробует ещё раз!' });
                if (soundOn) playFunDefeat();
              }
            } else {
              setGameOver({ result: 'draw', text: 'Ничья! Обе армии решили помириться.' });
            }
          };
          window.setTimeout(finish, animSpeed === 'off' ? 200 : 1100);
        }
      } catch {
        // невозможный ход — игнор
      }
    },
    [fen, playerColor, animSpeed, soundOn],
  );

  // Ход движка: думает, когда его очередь.
  useEffect(() => {
    if (!started || gameOver) return;
    if (sideToMove === engineColor && engine.ready && !game.isGameOver()) {
      // Небольшая пауза «на подумать» — движок не должен бить мгновенно,
      // иначе анимации игрока и движка сливаются.
      const t = window.setTimeout(() => {
        engine.analyse(fen, { movetime: opponent.movetime });
      }, 350);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, started, gameOver, engine.ready]);

  useEffect(() => {
    if (!started || gameOver) return;
    if (sideToMove !== engineColor) return;
    const m = engine.evaluation.bestmove;
    if (m && m.length >= 4) {
      applyMove({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.bestmoveSeq]);

  function newGame(color: 'w' | 'b') {
    engine.stop();
    moveSeqRef.current += 1;
    setPlayerColor(color);
    setFen(STARTING_FEN);
    setLastMove(null);
    setCaptured({ w: [], b: [] });
    setGameOver(null);
    setStarted(true);
  }

  const statusText = !started
    ? 'Выберите противника и начните битву!'
    : gameOver
      ? gameOver.text
      : playersTurn
        ? game.isCheck()
          ? 'Ваш король под атакой — спасайте его!'
          : 'Ваш ход!'
        : `${opponent.emoji} ${opponent.name} думает…`;

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4 text-center">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">
          <span className="text-amber-500">⚔️ Развлекательные шахматы</span>
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
          Армия Света против армии Тьмы: настоящие битвы на каждой клетке!
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Доска */}
        <div className="relative mx-auto w-full max-w-[640px]">
          <FunBoard
            fen={fen}
            lastMove={lastMove}
            canMove={playersTurn}
            playerColor={playerColor}
            tilt={tiltOn ? 22 : 0}
            animSpeed={animSpeed}
            soundOn={soundOn}
            onMove={applyMove}
            className={tiltOn ? 'py-6' : ''}
          />

          {/* Оверлей результата */}
          {gameOver && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center">
              <div className="animate-slide-up mx-4 rounded-3xl border-4 border-amber-400/80 bg-stone-900/90 px-8 py-6 text-center shadow-2xl backdrop-blur">
                <div className="text-5xl">
                  {gameOver.result === 'win' ? '🏆' : gameOver.result === 'loss' ? '🛡️' : '🤝'}
                </div>
                <div className="mt-2 text-lg font-semibold text-amber-100">{gameOver.text}</div>
                <button onClick={() => newGame(playerColor)} className="btn-primary mt-4">
                  Сыграть ещё раз
                </button>
              </div>
            </div>
          )}

          {/* Оверлей старта */}
          {!started && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center">
              <div className="animate-slide-up mx-4 rounded-3xl border-4 border-amber-400/80 bg-stone-900/90 px-8 py-6 text-center shadow-2xl backdrop-blur">
                <div className="text-5xl">⚔️</div>
                <div className="mt-2 max-w-xs text-lg font-semibold text-amber-100">
                  Готовы к битве против {opponent.emoji} {opponent.name}?
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button onClick={() => newGame('w')} className="btn-primary">
                    ☀️ Играть за Свет
                  </button>
                  <button onClick={() => newGame('b')} className="btn-ghost">
                    🌙 Играть за Тьму
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Панель управления */}
        <aside className="space-y-4">
          {/* Статус */}
          <div
            className={cn(
              'card py-4 text-center text-sm font-semibold',
              gameOver?.result === 'win' && 'border-amber-400/70',
              playersTurn && !gameOver && 'border-emerald-400/60',
            )}
          >
            {statusText}
          </div>

          {/* Противник */}
          <div className="card">
            <h3 className="mb-3 font-semibold">Противник</h3>
            <div className="grid grid-cols-2 gap-2">
              {OPPONENTS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOpponentId(o.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition',
                    o.id === opponentId
                      ? 'border-amber-400 bg-amber-100/70 shadow-glow dark:bg-amber-900/30'
                      : 'border-stone-200/70 bg-paper/60 hover:border-amber-300 dark:border-stone-700 dark:bg-stone-900/40',
                  )}
                >
                  <span className="text-2xl">{o.emoji}</span>
                  {o.name}
                </button>
              ))}
            </div>
            {started && !gameOver && (
              <p className="mt-2 text-[11px] text-stone-500">
                Новый противник вступит в бой со следующей партии.
              </p>
            )}
          </div>

          {/* Настройки */}
          <div className="card space-y-3">
            <h3 className="font-semibold">Настройки</h3>
            <ToggleRow
              label="Объёмная доска"
              value={tiltOn}
              onChange={setTiltOn}
            />
            <ToggleRow label="Звуки битвы" value={soundOn} onChange={setSoundOn} />
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Анимации</span>
              <div className="flex gap-1">
                {(
                  [
                    ['normal', 'Обычные'],
                    ['fast', 'Быстрые'],
                    ['off', 'Выкл'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setAnimSpeed(v)}
                    className={cn(
                      'rounded-lg px-2 py-1 text-xs font-medium transition',
                      animSpeed === v
                        ? 'bg-brand-500 text-white'
                        : 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Трофеи */}
          <div className="card">
            <h3 className="mb-2 font-semibold">Трофеи битвы</h3>
            <CapturedRow
              title={playerColor === 'w' ? 'Вы победили' : 'Враг потерял'}
              pieces={captured.b}
              color="b"
            />
            <CapturedRow
              title={playerColor === 'w' ? 'Враг захватил' : 'Вы потеряли'}
              pieces={captured.w}
              color="w"
            />
            {captured.w.length === 0 && captured.b.length === 0 && (
              <p className="text-xs text-stone-500">Пока никто не пал в бою.</p>
            )}
          </div>

          {started && (
            <div className="flex gap-2">
              <button onClick={() => newGame(playerColor)} className="btn-outline flex-1 text-sm">
                ↺ Заново
              </button>
              <button
                onClick={() => newGame(playerColor === 'w' ? 'b' : 'w')}
                className="btn-ghost flex-1 text-sm"
                title="Новая партия за другую армию"
              >
                {playerColor === 'w' ? '🌙 За Тьму' : '☀️ За Свет'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          'relative h-6 w-11 rounded-full transition',
          value ? 'bg-brand-500' : 'bg-stone-300 dark:bg-stone-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            value ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

function CapturedRow({ title, pieces, color }: { title: string; pieces: string[]; color: 'w' | 'b' }) {
  if (pieces.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11px] font-medium text-stone-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {pieces.map((t, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t}-${i}`}
            src={`/pieces/fantasy/${color}${t}.webp`}
            alt={t}
            className="h-8 w-8 object-contain"
          />
        ))}
      </div>
    </div>
  );
}
