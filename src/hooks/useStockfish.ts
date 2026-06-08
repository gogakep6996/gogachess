'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Загрузка Stockfish как Web Worker.
 * Сначала пытаемся локальный файл (его кладёт postinstall-скрипт из npm-пакета stockfish),
 * затем — fallback на unpkg.
 *
 * Stockfish 18, одноядерная сборка «lite-single» (~7 МБ): работает без COOP/COEP-заголовков
 * (без SharedArrayBuffer) и имеет приемлемый для веба размер. Большая сборка
 * (stockfish-18-single.wasm) сильнее, но весит ~112 МБ — для браузера непрактично.
 *
 * НАДЁЖНОСТЬ: воркер иногда зависает (за долгую сессию, при нехватке памяти у вкладки
 * и т.п.) — тогда `bestmove` не приходит, флаг `thinking` залипает и движок больше
 * не ходит. Чтобы это не требовало перезагрузки страницы, есть watchdog: если ход не
 * получен за отведённый бюджет времени — воркер пересоздаётся и последний расчёт
 * повторяется автоматически.
 */
const LOCAL_CANDIDATES = [
  '/engine/stockfish-18-lite-single.js',
  // legacy-имена на случай старого билда в public/engine
  '/engine/stockfish-nnue-16-single.js',
  '/engine/stockfish.js',
];
const CDN_URL = 'https://unpkg.com/stockfish@18.0.7/bin/stockfish-18-lite-single.js';

// Размер хеш-таблицы движка (МБ). Больше — точнее на глубине, но больше памяти.
// 32 МБ — безопасный компромисс для одноядерной lite-сборки и слабых устройств.
const HASH_MB = 32;

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
  /** Увеличивается на 1 при каждом полученном ходе движка. Потребителю удобно
   *  завязывать применение хода на этот счётчик, а не на строку bestmove —
   *  иначе два одинаковых хода подряд не применятся (значение dep не меняется). */
  bestmoveSeq: number;
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
  const [bestmoveSeq, setBestmoveSeq] = useState(0);
  const lastFenRef = useRef<string | null>(null);
  const lastOptsRef = useRef<{ depth?: number; movetime?: number } | undefined>(undefined);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Текущий выбранный уровень — нужен, чтобы заново применить его при пересоздании воркера.
  const skillRef = useRef<number>(20);
  // Функция перезапуска воркера; реальное значение присваивается внутри эффекта.
  const respawnRef = useRef<() => void>(() => {});

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    const opts = lastOptsRef.current;
    // Бюджет: для go movetime — время + запас; для go depth — фиксированный потолок.
    const budget = opts?.movetime ? opts.movetime + 6000 : 15000;
    watchdogRef.current = setTimeout(() => {
      // Ход не пришёл за бюджет — считаем воркер зависшим, перезапускаем.
      console.warn('[stockfish] watchdog: bestmove не получен — перезапуск воркера');
      setThinking(false);
      respawnRef.current();
    }, budget);
  }, [clearWatchdog]);

  useEffect(() => {
    let disposed = false;
    let urlPromise: Promise<string> | null = null;
    // Надо ли после готовности нового воркера повторить последний расчёт
    // (используется при авто-перезапуске по watchdog/ошибке воркера).
    let reanalyzeAfterReady = false;

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

    // Повторно запускает последний расчёт (после пересоздания воркера).
    function issueLastAnalysis() {
      const w = workerRef.current;
      const fen = lastFenRef.current;
      if (!w || !fen) return;
      setThinking(true);
      const opts = lastOptsRef.current;
      w.postMessage(`position fen ${fen}`);
      if (opts?.movetime) w.postMessage(`go movetime ${opts.movetime}`);
      else w.postMessage(`go depth ${opts?.depth ?? 16}`);
      armWatchdog();
    }

    function attach(w: Worker) {
      w.onmessage = (e: MessageEvent<string>) => {
        if (disposed) return;
        const line = typeof e.data === 'string' ? e.data : '';
        if (!line) return;

        if (line === 'uciok') {
          // Опции выставляем, пока движок простаивает (до isready / поиска).
          w.postMessage(`setoption name Skill Level value ${skillRef.current}`);
          w.postMessage(`setoption name Hash value ${HASH_MB}`);
          w.postMessage('isready');
        } else if (line === 'readyok') {
          setReady(true);
          if (reanalyzeAfterReady) {
            reanalyzeAfterReady = false;
            issueLastAnalysis();
          }
        } else if (line.startsWith('info ')) {
          parseInfoLine(line, lastFenRef.current);
        } else if (line.startsWith('bestmove')) {
          clearWatchdog();
          const parts = line.split(/\s+/);
          const best = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
          setEvaluation((prev) => ({ ...prev, bestmove: best }));
          setThinking(false);
          if (best) setBestmoveSeq((s) => s + 1);
        }
      };
      w.onerror = (err) => {
        if (disposed) return;
        console.error('[stockfish] worker error', err);
        reanalyzeAfterReady = lastFenRef.current !== null;
        respawnRef.current();
      };
    }

    async function spawn() {
      if (disposed) return;
      if (!urlPromise) urlPromise = pickEngineUrl();
      const url = await urlPromise;
      if (disposed) return;
      const old = workerRef.current;
      if (old) {
        try { old.postMessage('quit'); } catch { /* ignore */ }
        try { old.terminate(); } catch { /* ignore */ }
      }
      setReady(false);
      let worker: Worker;
      try {
        worker = new Worker(url);
      } catch {
        const blob = new Blob([`importScripts('${url}');`], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
      }
      workerRef.current = worker;
      attach(worker);
      worker.postMessage('uci');
    }

    respawnRef.current = () => {
      if (disposed) return;
      clearWatchdog();
      setThinking(false);
      reanalyzeAfterReady = lastFenRef.current !== null;
      void spawn();
    };

    void spawn();

    return () => {
      disposed = true;
      clearWatchdog();
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
  }, [clearWatchdog, armWatchdog]);

  const setSkill = useCallback((skill: number) => {
    const clamped = Math.min(20, Math.max(0, Math.round(skill)));
    skillRef.current = clamped;
    workerRef.current?.postMessage(`setoption name Skill Level value ${clamped}`);
  }, []);

  const analyse = useCallback(
    (fen: string, opts?: { depth?: number; movetime?: number }) => {
      const w = workerRef.current;
      if (!w || !ready) return;
      lastFenRef.current = fen;
      lastOptsRef.current = opts;
      setEvaluation({ bestmove: null, score: null, scoreType: null, depth: 0, pv: [] });
      setThinking(true);
      w.postMessage(`position fen ${fen}`);
      if (opts?.movetime) w.postMessage(`go movetime ${opts.movetime}`);
      else w.postMessage(`go depth ${opts?.depth ?? 16}`);
      armWatchdog();
    },
    [ready, armWatchdog],
  );

  const stop = useCallback(() => {
    clearWatchdog();
    workerRef.current?.postMessage('stop');
    setThinking(false);
  }, [clearWatchdog]);

  return { ready, thinking, evaluation, bestmoveSeq, setSkill, analyse, stop };
}
