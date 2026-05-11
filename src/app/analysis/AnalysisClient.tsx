'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { EnginePanel } from '@/components/room/EnginePanel';
import { useStockfish } from '@/hooks/useStockfish';
import { STARTING_FEN } from '@/lib/socket-events';

type Mode = 'free' | 'play-white' | 'play-black';

export function AnalysisClient() {
  const [fen, setFen] = useState<string>(STARTING_FEN);
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('free');
  const [editing, setEditing] = useState(false);
  const [skill, setSkill] = useState(10);

  const engine = useStockfish();

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const sideToMove = game.turn();

  useEffect(() => {
    if (engine.ready) engine.setSkill(skill);
  }, [engine.ready, skill, engine]);

  // Если это ход движка — пусть думает
  useEffect(() => {
    if (editing) return;
    const enginePlaysWhite = mode === 'play-black';
    const enginePlaysBlack = mode === 'play-white';
    const itsEnginesTurn =
      (enginePlaysWhite && sideToMove === 'w') || (enginePlaysBlack && sideToMove === 'b');
    if (itsEnginesTurn && engine.ready) {
      engine.analyse(fen, { movetime: 800 + skill * 80 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, mode, editing, engine.ready]);

  // Получили bestmove от движка — делаем ход
  useEffect(() => {
    if (editing) return;
    if (mode === 'free') return;
    const enginePlaysWhite = mode === 'play-black';
    const enginePlaysBlack = mode === 'play-white';
    const itsEnginesTurn =
      (enginePlaysWhite && sideToMove === 'w') || (enginePlaysBlack && sideToMove === 'b');
    if (itsEnginesTurn && engine.evaluation.bestmove) {
      const m = engine.evaluation.bestmove;
      if (m.length >= 4) {
        applyMove({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.evaluation.bestmove]);

  function applyMove(m: { from: string; to: string; promotion?: string }) {
    try {
      const next = new Chess(fen);
      const result = next.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
      if (!result) return;
      setFen(next.fen());
      setHistory((h) => [...h, result.san]);
    } catch {
      // невозможный ход — игнор
    }
  }

  function onUserMove(m: { from: string; to: string; promotion?: string }) {
    if (editing) return;
    if (mode === 'play-white' && sideToMove !== 'w') return;
    if (mode === 'play-black' && sideToMove !== 'b') return;
    applyMove(m);
  }

  function reset() {
    setFen(STARTING_FEN);
    setHistory([]);
  }

  function undo() {
    const next = new Chess(fen);
    const undone = next.undo();
    if (undone) {
      setFen(next.fen());
      setHistory((h) => h.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Анализ и игра с движком</h1>
          <p className="text-sm text-stone-500">
            Stockfish прямо в браузере — безопасно и без серверных вычислений
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="input max-w-xs"
          >
            <option value="free">Свободный анализ</option>
            <option value="play-white">Играть за белых</option>
            <option value="play-black">Играть за чёрных</option>
          </select>
          <select
            value={skill}
            onChange={(e) => setSkill(Number(e.target.value))}
            className="input max-w-[8rem]"
          >
            {[0, 3, 6, 10, 14, 17, 20].map((v) => (
              <option key={v} value={v}>
                Уровень {v}
              </option>
            ))}
          </select>
          <button onClick={undo} className="btn-outline text-sm">
            ⟲ Назад
          </button>
          <button onClick={reset} className="btn-ghost text-sm">
            ↺ Сброс
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className={editing ? 'btn-primary text-sm' : 'btn-outline text-sm'}
          >
            {editing ? '▶ Завершить' : '✎ Редактор'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <ChessBoard
            fen={fen}
            canMove={!editing && mode !== 'free' ? sideToMoveAllowed(sideToMove, mode) : !editing}
            isEditing={editing}
            canEdit={editing}
            onMove={onUserMove}
            onEditFen={(f) => setFen(f)}
            flipped={mode === 'play-black'}
          />
          <div className="card">
            <h3 className="mb-2 font-semibold">Ходы</h3>
            <ol className="grid grid-cols-2 gap-x-3 text-sm sm:grid-cols-4">
              {pairs(history).map(([w, b], i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-6 text-stone-500">{i + 1}.</span>
                  <span className="font-mono">{w}</span>
                  {b && <span className="font-mono">{b}</span>}
                </li>
              ))}
              {history.length === 0 && <span className="text-stone-500">Партия не начата</span>}
            </ol>
          </div>
        </div>

        <aside>
          <EnginePanel fen={fen} onSuggest={(m) => applyMove(m)} />
        </aside>
      </div>
    </div>
  );
}

function pairs<T>(arr: T[]): Array<[T, T | null]> {
  const out: Array<[T, T | null]> = [];
  for (let i = 0; i < arr.length; i += 2) out.push([arr[i], arr[i + 1] ?? null]);
  return out;
}

function sideToMoveAllowed(turn: 'w' | 'b', mode: Mode): boolean {
  if (mode === 'play-white') return turn === 'w';
  if (mode === 'play-black') return turn === 'b';
  return true;
}
