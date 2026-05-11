'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Загрузка Stockfish как Web Worker.
 * Сначала пытаемся локальный файл (его кладёт postinstall-скрипт из npm-пакета stockfish),
 * затем — fallback на unpkg.
 *
 * Используется однопоточная сборка (без SharedArrayBuffer) — работает без COOP/COEP-заголовков.
 */
const LOCAL_CANDIDATES = [
  '/engine/stockfish-nnue-16-single.js',
  '/engine/stockfish.js',
];
const CDN_URL = 'https://unpkg.com/stockfish@16.0.0/src/stockfish.js';

async function pickEngineUrl(): Promise<string> {
  for (const url of LOCAL_CANDIDATES) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // continue
    }
  }
  return CDN_URL;
}

export interface EngineEval {
  bestmove: string | null;
  score: number | null;        // в сантипешках, от лица белых
  scoreType: 'cp' | 'mate' | null;
  depth: number;
  pv: string[];                // главный вариант (ходы UCI)
}

export interface UseStockfishResult {
  ready: boolean;
  thinking: boolean;
  evaluation: EngineEval;
  setSkill: (skill: number) => void;
  analyse: (fen: string, opts?: { depth?: number; movetime?: number }) => void;
  stop: () => void;
}

export function useStockfish(): UseStockfishResult {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [evaluation, setEvaluation] = useState<EngineEval>({
    bestmove: null,
    score: null,
    scoreType: null,
    depth: 0,
    pv: [],
  });
  const lastFenRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let worker: Worker | null = null;

    function parseInfoLine(line: string, fen: string | null) {
      const depthMatch = line.match(/depth (\d+)/);
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/ pv (.+)$/);
      if (!depthMatch && !scoreMatch && !pvMatch) return;

      setEvaluation((prev) => {
        const depth = depthMatch ? Number(depthMatch[1]) : prev.depth;
        let score = prev.score;
        let scoreType = prev.scoreType;
        if (scoreMatch) {
          scoreType = scoreMatch[1] as 'cp' | 'mate';
          score = Number(scoreMatch[2]);
          // Stockfish отдаёт оценку от лица стороны на ходу — приводим к белым
          if (fen) {
            const sideToMove = fen.split(' ')[1];
            if (sideToMove === 'b') score = -score;
          }
        }
        const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : prev.pv;
        return { ...prev, depth, score, scoreType, pv };
      });
    }

    function attachListeners(w: Worker) {
      w.onmessage = (e: MessageEvent<string>) => {
        if (disposed) return;
        const line = typeof e.data === 'string' ? e.data : '';
        if (!line) return;

        if (line === 'uciok') {
          w.postMessage('isready');
        } else if (line === 'readyok') {
          setReady(true);
        } else if (line.startsWith('info ')) {
          parseInfoLine(line, lastFenRef.current);
        } else if (line.startsWith('bestmove')) {
          const parts = line.split(/\s+/);
          const best = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
          setEvaluation((prev) => ({ ...prev, bestmove: best }));
          setThinking(false);
        }
      };
      w.onerror = (err) => {
        console.error('[stockfish] worker error', err);
      };
    }

    (async () => {
      const url = await pickEngineUrl();
      if (disposed) return;
      try {
        worker = new Worker(url);
      } catch {
        const blob = new Blob([`importScripts('${url}');`], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
      }
      workerRef.current = worker;
      attachListeners(worker);
      worker.postMessage('uci');
    })();

    return () => {
      disposed = true;
      const w = workerRef.current;
      if (w) {
        try {
          w.postMessage('quit');
        } catch {
          // ignore
        }
        w.terminate();
      }
      workerRef.current = null;
    };
  }, []);

  const setSkill = useCallback((skill: number) => {
    const clamped = Math.min(20, Math.max(0, Math.round(skill)));
    workerRef.current?.postMessage(`setoption name Skill Level value ${clamped}`);
  }, []);

  const analyse = useCallback((fen: string, opts?: { depth?: number; movetime?: number }) => {
    const w = workerRef.current;
    if (!w || !ready) return;
    lastFenRef.current = fen;
    setEvaluation({ bestmove: null, score: null, scoreType: null, depth: 0, pv: [] });
    setThinking(true);
    w.postMessage(`position fen ${fen}`);
    if (opts?.movetime) w.postMessage(`go movetime ${opts.movetime}`);
    else w.postMessage(`go depth ${opts?.depth ?? 16}`);
  }, [ready]);

  const stop = useCallback(() => {
    workerRef.current?.postMessage('stop');
    setThinking(false);
  }, []);

  return { ready, thinking, evaluation, setSkill, analyse, stop };
}
