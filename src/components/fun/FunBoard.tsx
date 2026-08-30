'use client';

/**
 * Доска «Развлекательных шахмат»: 2.5D-перспектива, фигуры-персонажи (спрайты
 * /public/pieces/fantasy) и боевые анимации взятий (выпад → удар → гибель).
 *
 * Архитектура анимации: родитель управляет настоящей позицией (props.fen).
 * Доска держит displayFen — «отрисованную» позицию. Когда приходит новый fen
 * с описанием хода (lastMove), атакующая фигура рендерится ещё по displayFen,
 * но её координаты переопределяются на целевую клетку — CSS-transition делает
 * выпад. В момент удара включаются эффекты и звук, жертва проигрывает гибель,
 * затем displayFen фиксируется на новом fen.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { Chess, type Square as ChessSquare } from 'chess.js';
import { cn } from '@/lib/utils';
import {
  playFunMove,
  playFunSlash,
  playFunSmash,
  playFunMagic,
  playFunCheck,
  unlockFunSounds,
} from '@/lib/fun-sounds';
import { WeaponSprite, weaponKindFor, type WeaponKind } from './FunWeapons';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export type FunAnimSpeed = 'normal' | 'fast' | 'off';
export type Weapon = 'slash' | 'smash' | 'magic';

export interface FunLastMove {
  from: string;
  to: string;
  /** Тип атакующей фигуры (p/n/b/r/q/k). */
  piece: string;
  color: 'w' | 'b';
  captured?: string;
  /** Флаги chess.js: e — взятие на проходе, k/q — рокировки. */
  flags: string;
  check: boolean;
  mate: boolean;
  /** Монотонный счётчик ходов — форсирует обработку повторяющихся структур. */
  seq: number;
}

export interface FunBoardProps {
  fen: string;
  lastMove: FunLastMove | null;
  /** Может ли игрок сейчас ходить (его очередь, партия не окончена). */
  canMove: boolean;
  playerColor: 'w' | 'b';
  /** Наклон доски в градусах; 0 — плоский вид сверху. */
  tilt: number;
  animSpeed: FunAnimSpeed;
  soundOn: boolean;
  onMove: (m: { from: string; to: string; promotion?: string }) => void;
  className?: string;
}

interface ActiveAnim {
  seq: number;
  from: string;
  to: string;
  weapon: Weapon;
  captured: boolean;
  /** Клетка съеденной фигуры (у en passant не совпадает с to). */
  victimSquare: string | null;
  /** Вторичное перемещение (ладья при рокировке). */
  rookFrom?: string;
  rookTo?: string;
  phase: 'lunge' | 'impact';
}

const WEAPON_BY_PIECE: Record<string, Weapon> = {
  p: 'slash',
  n: 'slash',
  r: 'smash',
  b: 'magic',
  q: 'magic',
  k: 'magic',
};

function spriteUrl(color: string, type: string): string {
  return `/pieces/fantasy/${color}${type}.webp`;
}

export function FunBoard({
  fen,
  lastMove,
  canMove,
  playerColor,
  tilt,
  animSpeed,
  soundOn,
  onMove,
  className,
}: FunBoardProps) {
  const flipped = playerColor === 'b';
  const [displayFen, setDisplayFen] = useState(fen);
  const displayFenRef = useRef(fen);
  displayFenRef.current = displayFen;
  const [anim, setAnim] = useState<ActiveAnim | null>(null);
  const [shaking, setShaking] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [legal, setLegal] = useState<string[]>([]);
  const timersRef = useRef<number[]>([]);
  /** Коэффициент длительности анимаций (выпад, гибель, взмах оружия). */
  const speedK = animSpeed === 'fast' ? 0.55 : 1;

  useEffect(() => {
    unlockFunSounds();
  }, []);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };
  const schedule = (ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  // ── Обработка нового хода: запускаем боевую сцену ──
  useEffect(() => {
    if (fen === displayFenRef.current) return;
    // Предыдущая сцена не доиграла — мгновенно фиксируем её результат.
    clearTimers();

    const commit = () => {
      setAnim(null);
      setDisplayFen(fen);
    };

    if (!lastMove || animSpeed === 'off') {
      commit();
      if (soundOn && lastMove) {
        if (lastMove.captured) playWeapon(WEAPON_BY_PIECE[lastMove.piece] ?? 'slash');
        else playFunMove();
        if (lastMove.check && !lastMove.mate) playFunCheck();
      }
      return;
    }

    const weapon = WEAPON_BY_PIECE[lastMove.piece] ?? 'slash';
    const captured = !!lastMove.captured;

    let victimSquare: string | null = null;
    if (captured) {
      victimSquare = lastMove.flags.includes('e')
        ? `${lastMove.to[0]}${lastMove.from[1]}` // en passant: пешка на ряду атакующего
        : lastMove.to;
    }
    let rookFrom: string | undefined;
    let rookTo: string | undefined;
    if (lastMove.flags.includes('k')) {
      const rank = lastMove.color === 'w' ? '1' : '8';
      rookFrom = `h${rank}`;
      rookTo = `f${rank}`;
    } else if (lastMove.flags.includes('q')) {
      const rank = lastMove.color === 'w' ? '1' : '8';
      rookFrom = `a${rank}`;
      rookTo = `d${rank}`;
    }

    setSelected(null);
    setLegal([]);
    setAnim({
      seq: lastMove.seq,
      from: lastMove.from,
      to: lastMove.to,
      weapon,
      captured,
      victimSquare,
      rookFrom,
      rookTo,
      phase: 'lunge',
    });

    const lungeMs = 270 * speedK;
    const deathMs = 560 * speedK;

    schedule(lungeMs, () => {
      setAnim((a) => (a && a.seq === lastMove.seq ? { ...a, phase: 'impact' } : a));
      if (soundOn) {
        if (captured) playWeapon(weapon);
        else playFunMove();
        if (lastMove.check && !lastMove.mate) {
          schedule(180, () => playFunCheck());
        }
      }
      if (captured && weapon === 'smash') {
        setShaking(lastMove.seq);
        schedule(360, () => setShaking(0));
      }
    });

    schedule(lungeMs + (captured ? deathMs : 60), commit);

    // Размонтирование/смена партии — таймеры чистятся в cleanup ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, lastMove?.seq]);

  useEffect(() => () => clearTimers(), []);

  function playWeapon(w: Weapon) {
    if (w === 'smash') playFunSmash();
    else if (w === 'magic') playFunMagic();
    else playFunSlash();
  }

  // ── Позиция для отрисовки ──
  const displayGame = useMemo<Chess | null>(() => {
    try {
      return new Chess(displayFen);
    } catch {
      return null;
    }
  }, [displayFen]);

  const trueGame = useMemo<Chess | null>(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const checkSquare = useMemo<string | null>(() => {
    const g = displayGame;
    if (!g || !g.isCheck()) return null;
    const turn = g.turn();
    const board = g.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) return `${FILES[c]}${8 - r}`;
      }
    }
    return null;
  }, [displayGame]);

  /** Визуальные координаты клетки (столбец/ряд 0–7) с учётом разворота. */
  function visualOf(sq: string): { col: number; row: number } {
    const file = FILES.indexOf(sq[0] as (typeof FILES)[number]);
    const rank = Number(sq[1]);
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank - 1 : 8 - rank;
    return { col, row };
  }

  const animating = displayFen !== fen || anim !== null;

  // ── Клики ──
  function onSquareClick(sq: string) {
    if (!canMove || animating || !trueGame) return;
    if (selected) {
      if (sq === selected) {
        setSelected(null);
        setLegal([]);
        return;
      }
      if (legal.includes(sq)) {
        onMove({ from: selected, to: sq, promotion: 'q' });
        setSelected(null);
        setLegal([]);
        return;
      }
    }
    const p = trueGame.get(sq as ChessSquare);
    if (p && p.color === playerColor) {
      setSelected(sq);
      const moves = trueGame.moves({ square: sq as ChessSquare, verbose: true }) as Array<{ to: string }>;
      setLegal(moves.map((m) => m.to));
    } else {
      setSelected(null);
      setLegal([]);
    }
  }

  // ── Фигуры (по displayFen, с переопределением позиций атаки) ──
  const pieces = useMemo(() => {
    const g = displayGame;
    if (!g) return [] as Array<{ sq: string; color: string; type: string }>;
    const out: Array<{ sq: string; color: string; type: string }> = [];
    const board = g.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) out.push({ sq: `${FILES[c]}${8 - r}`, color: p.color, type: p.type });
      }
    }
    return out;
  }, [displayGame]);

  const impactVisual = anim && anim.phase === 'impact' && anim.captured ? visualOf(anim.victimSquare ?? anim.to) : null;

  const squares: ReactElement[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = flipped ? FILES[7 - col] : FILES[col];
      const rank = flipped ? row + 1 : 8 - row;
      const sq = `${file}${rank}`;
      const isLight = (col + row) % 2 === 0;
      const isSel = selected === sq;
      const isLegal = legal.includes(sq);
      const hasPiece = !!displayGame?.get(sq as ChessSquare);
      const isCheckHere = checkSquare === sq;
      squares.push(
        <div
          key={sq}
          onClick={() => onSquareClick(sq)}
          className={cn(
            'relative',
            isLight ? 'fun-square-light' : 'fun-square-dark',
            isSel && 'fun-square-sel',
            canMove && !animating && 'cursor-pointer',
          )}
        >
          {isCheckHere && <span className="fun-cell-check pointer-events-none absolute inset-0" />}
          {isLegal && !hasPiece && (
            <span className="fun-dot pointer-events-none absolute left-1/2 top-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2" />
          )}
          {isLegal && hasPiece && (
            <span className="fun-dot-capture pointer-events-none absolute inset-[6%]" />
          )}
          {/* Координаты */}
          {col === 0 && (
            <span className={cn('pointer-events-none absolute left-1 top-0.5 text-[10px] font-bold', isLight ? 'text-stone-700/60' : 'text-stone-100/60')}>
              {rank}
            </span>
          )}
          {row === 7 && (
            <span className={cn('pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-bold', isLight ? 'text-stone-700/60' : 'text-stone-100/60')}>
              {file}
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className={cn('fun-scene select-none', shaking ? 'fun-shaking' : undefined, className)}>
      <div
        className="fun-frame rounded-3xl p-2 sm:p-3"
        style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tilt}deg)` }}
      >
        {/* Факелы по углам рамки */}
        <Torches />
        <div className="fun-board relative aspect-square w-full overflow-visible rounded-xl">
          {/* Слой клеток */}
          <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl shadow-inner">
            {squares}
          </div>

          {/* Слой фигур */}
          <div className="pointer-events-none absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {pieces.map((p) => {
              let pos = p.sq;
              let extraClass = '';
              let instant = false;
              if (anim) {
                if (p.sq === anim.from) {
                  pos = anim.to; // выпад атакующего (transition по left/top)
                } else if (anim.rookFrom && p.sq === anim.rookFrom && anim.rookTo) {
                  pos = anim.rookTo;
                } else if (anim.captured && p.sq === (anim.victimSquare ?? anim.to)) {
                  if (anim.phase === 'impact') extraClass = 'fun-piece-dying';
                }
              } else {
                instant = true; // вне сцены фигуры «телепортируются» без transition
              }
              const v = visualOf(pos);
              const isAttacker = anim && p.sq === anim.from;
              const isSel = selected === p.sq;
              // Оружие достаётся только при взятии; взмах зеркалится по
              // направлению атаки, а удар синхронизирован с концом выпада.
              const showWeapon = !!(isAttacker && anim?.captured);
              const weaponMirror = showWeapon && anim ? visualOf(anim.to).col < visualOf(anim.from).col : false;
              return (
                <div
                  key={`${p.sq}-${p.color}${p.type}`}
                  className={cn('fun-piece absolute', instant && 'fun-piece--instant', isSel && 'fun-piece-selected')}
                  style={{
                    left: `${v.col * 12.5}%`,
                    top: `${v.row * 12.5}%`,
                    width: '12.5%',
                    height: '12.5%',
                    zIndex: isAttacker ? 40 : 10 + v.row,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={spriteUrl(p.color, p.type)}
                    alt=""
                    draggable={false}
                    className={cn('fun-piece-img absolute', extraClass)}
                    style={{
                      bottom: '4%',
                      left: '50%',
                      width: '96%',
                      // В наклонном виде персонажи «стоят» и могут быть высокими,
                      // в плоском — ограничиваем рост, чтобы задние ряды не вылезали за доску.
                      height: tilt > 0 ? '175%' : '132%',
                      objectFit: 'contain',
                      objectPosition: 'bottom',
                      transform: `translateX(-50%) rotateX(${-tilt}deg)`,
                      transformOrigin: 'bottom center',
                    }}
                  />
                  {showWeapon && (
                    <WeaponOverlay
                      kind={weaponKindFor(p.type, p.color as 'w' | 'b')}
                      dark={p.color === 'b'}
                      mirror={weaponMirror}
                      tilt={tilt}
                      durationMs={(270 * speedK) / 0.6}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Слой эффектов удара */}
          {impactVisual && anim && (
            <ImpactFx key={anim.seq} col={impactVisual.col} row={impactVisual.row} weapon={anim.weapon} tilt={tilt} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Оружие в «руке» атакующего: вертикальная плоскость (rotateX против наклона
 * доски), внутри — SVG-оружие с keyframes-взмахом. Длительность подобрана так,
 * чтобы удар (~60% анимации) совпал с окончанием выпада фигуры.
 */
function WeaponOverlay({
  kind,
  dark,
  mirror,
  tilt,
  durationMs,
}: {
  kind: WeaponKind;
  dark: boolean;
  mirror: boolean;
  tilt: number;
  durationMs: number;
}) {
  const animClass =
    kind === 'hammer'
      ? 'fun-weapon--hammer'
      : kind === 'trident'
        ? 'fun-weapon--trident'
        : kind === 'staff' || kind === 'scepter'
          ? 'fun-weapon--cast'
          : 'fun-weapon--sword';
  const tall = kind === 'greatsword';
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: '6%',
        bottom: '4%',
        width: '88%',
        height: tilt > 0 ? (tall ? '190%' : '160%') : tall ? '140%' : '120%',
        transform: `rotateX(${-tilt}deg)${mirror ? ' scaleX(-1)' : ''}`,
        transformOrigin: 'bottom center',
        zIndex: 5,
      }}
    >
      <div className={cn('fun-weapon absolute inset-0', animClass)} style={{ animationDuration: `${durationMs}ms` }}>
        <WeaponSprite kind={kind} dark={dark} />
      </div>
    </div>
  );
}

/** Эффекты в точке удара: вспышка, дуга/кольцо, частицы. */
function ImpactFx({ col, row, weapon, tilt }: { col: number; row: number; weapon: Weapon; tilt: number }) {
  const particles = useMemo(() => {
    const colors =
      weapon === 'smash'
        ? ['#ffb347', '#ff8c42', '#d9d2c5', '#8a8378']
        : weapon === 'magic'
          ? ['#c084fc', '#a855f7', '#f0abfc', '#facc15']
          : ['#fde68a', '#fbbf24', '#f4f4f5', '#d4d4d8'];
    return Array.from({ length: 9 }, (_, i) => {
      const ang = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 55;
      return {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist - 25,
        size: 5 + Math.random() * 7,
        color: colors[i % colors.length],
        delay: Math.random() * 60,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
        width: '12.5%',
        height: '12.5%',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `rotateX(${-tilt}deg) translateY(-30%)`, transformOrigin: 'bottom center' }}
      >
        <span className={cn('absolute inset-[-25%]', 'fun-fx-flash', `fun-fx-flash--${weapon}`)} />
        {weapon === 'slash' && <span className="fun-fx-slash-arc absolute inset-[-10%]" />}
        {weapon !== 'slash' && (
          <span className={cn('absolute inset-[-18%]', 'fun-fx-ring', `fun-fx-ring--${weapon}`)} />
        )}
        {particles.map((pt, i) => (
          <span
            key={i}
            className="fun-fx-particle absolute"
            style={
              {
                left: '50%',
                top: '55%',
                width: pt.size,
                height: pt.size,
                background: pt.color,
                animationDelay: `${pt.delay}ms`,
                '--fx-x': `${pt.x}px`,
                '--fx-y': `${pt.y}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function Torches() {
  return (
    <>
      <span className="fun-torch pointer-events-none absolute -left-1 -top-3 z-10 text-xl sm:text-2xl" aria-hidden>
        🔥
      </span>
      <span
        className="fun-torch pointer-events-none absolute -right-1 -top-3 z-10 text-xl sm:text-2xl"
        style={{ animationDelay: '0.7s' }}
        aria-hidden
      >
        🔥
      </span>
    </>
  );
}
