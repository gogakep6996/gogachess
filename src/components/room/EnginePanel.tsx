'use client';

import { useEffect, useState } from 'react';
import { useStockfish } from '@/hooks/useStockfish';

interface Props {
  fen: string;
  /** В режиме комнаты (учитель/ученик) — только анализ. */
  onSuggest?: (move: { from: string; to: string }) => void;
  /** Узкий вид для комнаты без прокрутки страницы. */
  variant?: 'default' | 'room';
  /** Кнопка «Сыграть с компьютером» — в комнате. */
  onTogglePlayVsComputer?: () => void;
  vsComputerActive?: boolean;
  vsComputerThinking?: boolean;
  showPlayVsComputer?: boolean;
}

const SKILL_LEVELS = [
  { value: 0, label: 'Новичок' },
  { value: 5, label: 'Лёгкий' },
  { value: 10, label: 'Средний' },
  { value: 15, label: 'Продвинутый' },
  { value: 20, label: 'Максимум' },
];

export function EnginePanel({
  fen,
  onSuggest,
  variant = 'default',
  onTogglePlayVsComputer,
  vsComputerActive = false,
  vsComputerThinking = false,
  showPlayVsComputer = false,
}: Props) {
  const { ready, thinking, evaluation, setSkill, analyse, stop } = useStockfish();
  const [autoAnalyse, setAutoAnalyse] = useState(false);
  const [skill, setSkillState] = useState(15);

  const room = variant === 'room';

  useEffect(() => {
    if (ready) setSkill(skill);
  }, [ready, skill, setSkill]);

  useEffect(() => {
    if (autoAnalyse && ready) analyse(fen, { depth: room ? 14 : 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, autoAnalyse, ready, room]);

  const evalText = formatEval(evaluation);
  const bestUci = evaluation.bestmove;

  function suggest() {
    if (bestUci && bestUci.length >= 4) {
      onSuggest?.({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4) });
    }
  }

  if (room) {
    return (
      <div className="w-full rounded-xl border border-stone-200/80 bg-white/90 p-2.5 shadow-sm dark:border-stone-700/70 dark:bg-stone-900/65">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-500 text-[10px] font-bold text-white shadow-sm">
              SF
            </span>
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Движок</span>
          </div>
          <span
            className={
              ready
                ? 'shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400'
            }
          >
            {ready ? '● готов' : '○ грузим'}
          </span>
        </div>

        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-500">Уровень</span>
          <select
            className="mb-2 w-full rounded-md border border-stone-300/70 bg-white px-1.5 py-1 text-[11px] text-stone-800 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            value={skill}
            onChange={(e) => setSkillState(Number(e.target.value))}
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label} (+{l.value})
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => analyse(fen, { depth: 13, movetime: 380 })}
            disabled={!ready || thinking}
            className="flex-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-medium leading-none text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {thinking ? '…' : 'Анализ'}
          </button>
          {thinking && (
            <button
              type="button"
              onClick={stop}
              className="rounded-md border border-stone-400/70 px-1.5 py-1 text-[11px] dark:border-stone-600"
              title="Стоп"
            >
              ⧁
            </button>
          )}
        </div>

        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-600 dark:text-stone-400">
          <input
            type="checkbox"
            checked={autoAnalyse}
            onChange={(e) => setAutoAnalyse(e.target.checked)}
            className="h-3 w-3 shrink-0 rounded border-stone-300 text-brand-500"
          />
          авто-анализ
        </label>

        <div className="mt-2 rounded-md bg-stone-50 px-2 py-1.5 text-[11px] leading-tight text-stone-700 dark:bg-stone-800/60 dark:text-stone-300">
          <div className="flex justify-between gap-1">
            <span className="text-stone-500">Оценка</span>
            <span className="font-semibold">{evalText}</span>
          </div>
          <div className="mt-0.5 flex justify-between gap-1">
            <span className="text-stone-500">Глубина</span>
            <span className="font-mono">{evaluation.depth || '—'}</span>
          </div>
          <div className="mt-0.5 flex justify-between gap-1">
            <span className="text-stone-500">Ход</span>
            <span className="truncate font-mono">{bestUci ?? '—'}</span>
          </div>
        </div>

        {onSuggest && bestUci && (
          <button
            type="button"
            onClick={suggest}
            className="mt-2 w-full rounded-md border border-stone-400/60 py-1 text-[11px] hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
          >
            Сделать ход {bestUci}
          </button>
        )}

        {showPlayVsComputer && onTogglePlayVsComputer && (
          <button
            type="button"
            onClick={onTogglePlayVsComputer}
            className={
              vsComputerActive
                ? 'mt-2 w-full rounded-md border border-emerald-500/70 bg-emerald-500/15 px-1.5 py-1.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300'
                : 'mt-2 w-full rounded-md bg-brand-500 px-1.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-brand-600'
            }
          >
            {vsComputerActive
              ? vsComputerThinking
                ? '⏳ Компьютер думает…'
                : '■ Остановить игру с ПК'
              : '🤖 Сыграть с компьютером'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Движок Stockfish</h3>
        <span className="text-xs text-stone-500">{ready ? 'готов' : 'загрузка…'}</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-stone-500">Уровень сложности</span>
        <select className="input" value={skill} onChange={(e) => setSkillState(Number(e.target.value))}>
          {SKILL_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label} (skill {l.value})
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => analyse(fen, { depth: 18 })}
          disabled={!ready || thinking}
          className="btn-primary flex-1"
        >
          {thinking ? 'Анализирую…' : 'Анализ позиции'}
        </button>
        {thinking && (
          <button type="button" onClick={stop} className="btn-outline">
            Стоп
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoAnalyse}
          onChange={(e) => setAutoAnalyse(e.target.checked)}
          className="h-4 w-4 rounded border-stone-300 text-brand-500 focus:ring-brand-300"
        />
        Авто-анализ при каждом ходе
      </label>

      <div className="rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
        <div className="flex justify-between">
          <span className="text-stone-500">Оценка</span>
          <span className="font-semibold">{evalText}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-stone-500">Глубина</span>
          <span className="font-semibold">{evaluation.depth}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-stone-500">Лучший ход</span>
          <span className="font-mono text-sm">{bestUci ?? '—'}</span>
        </div>
        {evaluation.pv.length > 0 && (
          <div className="mt-2 text-xs text-stone-600 dark:text-stone-400">
            <span className="text-stone-500">Вариант:</span>{' '}
            <span className="font-mono">{evaluation.pv.slice(0, 8).join(' ')}</span>
          </div>
        )}
      </div>

      {onSuggest && bestUci && (
        <button type="button" onClick={suggest} className="btn-outline w-full">
          Сделать ход движка ({bestUci})
        </button>
      )}
    </div>
  );
}

function formatEval(e: { score: number | null; scoreType: 'cp' | 'mate' | null }): string {
  if (e.score === null || e.scoreType === null) return '—';
  if (e.scoreType === 'mate') {
    const sign = e.score > 0 ? '+' : '';
    return `мат ${sign}${e.score}`;
  }
  const v = e.score / 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}`;
}
