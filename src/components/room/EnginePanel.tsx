'use client';

import { useEffect, useState } from 'react';
import { Lightning, Stop } from '@phosphor-icons/react';
import { useStockfish } from '@/hooks/useStockfish';
import { cn } from '@/lib/utils';
import { FieldLabel, StatusChip, SwitchRow, ToolButton } from './ui';

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
  /** Сообщает наружу выбранный уровень (Skill 0..20), чтобы играющий движок
   *  в комнате использовал именно его. */
  onSkillChange?: (skill: number) => void;
  /** Если задан — уровень не выбирается вручную, а зафиксирован задачей
   *  (например, на доске ученика). Показываем его только для информации. */
  lockedSkill?: number;
}

const SKILL_LABEL: Record<number, string> = {
  0: 'Новичок',
  5: 'Лёгкий',
  10: 'Средний',
  15: 'Продвинутый',
  20: 'Максимум',
};
function skillLabel(v: number): string {
  if (SKILL_LABEL[v]) return SKILL_LABEL[v];
  if (v >= 18) return 'Максимум';
  if (v >= 13) return 'Продвинутый';
  if (v >= 8) return 'Средний';
  if (v >= 3) return 'Лёгкий';
  return 'Новичок';
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
  onSkillChange,
  lockedSkill,
}: Props) {
  const { ready, thinking, evaluation, setSkill, analyse, stop } = useStockfish();
  const [autoAnalyse, setAutoAnalyse] = useState(false);
  const [skillState, setSkillState] = useState(15);
  // Если уровень зафиксирован задачей — используем его, иначе выбор пользователя.
  const skill = lockedSkill ?? skillState;
  const skillLocked = lockedSkill !== undefined;

  const room = variant === 'room';

  useEffect(() => {
    if (ready) setSkill(skill);
  }, [ready, skill, setSkill]);

  // Сообщаем выбранный уровень наружу (первично и при каждой смене), чтобы
  // играющий движок в комнате использовал именно его.
  useEffect(() => {
    onSkillChange?.(skill);
  }, [skill, onSkillChange]);

  useEffect(() => {
    if (autoAnalyse && ready) analyse(fen, { depth: room ? 15 : 16 });
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
      <div className="flex w-full flex-col gap-2">
        {/* Главный переключатель: движок играет за соперника. */}
        {showPlayVsComputer && onTogglePlayVsComputer && (
          <SwitchRow
            label={
              vsComputerActive
                ? vsComputerThinking
                  ? 'Соперник думает'
                  : 'Движок играет за соперника'
                : 'Движок не играет'
            }
            hint={
              vsComputerActive
                ? 'Отвечает за противоположную сторону'
                : 'Включите, чтобы движок делал ответные ходы'
            }
            checked={vsComputerActive}
            onChange={onTogglePlayVsComputer}
          />
        )}

        <label className="block">
          <FieldLabel>Уровень соперника</FieldLabel>
          {skillLocked ? (
            <div
              className="flex h-8 items-center rounded-xl bg-brand-50 px-2.5 text-[12px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
              title="Сложность задана в задаче и не меняется"
            >
              {skillLabel(skill)} · из задачи
            </div>
          ) : (
            <select
              className="h-8 w-full rounded-xl border-0 bg-stone-900/[0.05] px-2 text-[12px] font-semibold text-stone-700 outline-none ring-1 ring-inset ring-transparent transition focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800"
              value={skill}
              onChange={(e) => setSkillState(Number(e.target.value))}
            >
              {SKILL_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </label>

        <div>
          <FieldLabel>Разбор позиции</FieldLabel>
          <div className="flex gap-1.5">
            <ToolButton
              icon={Lightning}
              tone="neutral"
              block
              disabled={!ready || thinking}
              onClick={() => analyse(fen, { depth: 15, movetime: 800 })}
            >
              {thinking ? 'Считаю…' : 'Оценить'}
            </ToolButton>
            {thinking && (
              <ToolButton icon={Stop} tone="quiet" onClick={stop} aria-label="Остановить расчёт">
                Стоп
              </ToolButton>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-xl bg-stone-900/[0.04] px-2.5 py-2 text-[12px] dark:bg-white/[0.05]">
          <dt className="text-stone-500 dark:text-stone-400">Оценка</dt>
          <dd className="text-right font-semibold tabular-nums text-stone-800 dark:text-stone-100">
            {evalText}
          </dd>
          <dt className="text-stone-500 dark:text-stone-400">Глубина</dt>
          <dd className="text-right tabular-nums text-stone-700 dark:text-stone-200">
            {evaluation.depth || '-'}
          </dd>
          <dt className="text-stone-500 dark:text-stone-400">Лучший ход</dt>
          <dd className="truncate text-right font-semibold text-stone-800 dark:text-stone-100">
            {bestUci ?? '-'}
          </dd>
        </dl>

        <label className="flex cursor-pointer items-center gap-2 px-0.5 text-[12px] text-stone-600 dark:text-stone-300">
          <input
            type="checkbox"
            checked={autoAnalyse}
            onChange={(e) => setAutoAnalyse(e.target.checked)}
            className="h-3.5 w-3.5 shrink-0 rounded border-stone-300 text-brand-600 focus:ring-brand-500/50 dark:border-stone-600 dark:bg-stone-800"
          />
          Считать после каждого хода
        </label>

        {onSuggest && bestUci && (
          <ToolButton tone="neutral" block onClick={suggest}>
            Сделать ход {bestUci}
          </ToolButton>
        )}

        <div className="flex justify-end">
          <StatusChip tone={ready ? 'brand' : 'neutral'} live={thinking}>
            {ready ? 'Stockfish готов' : 'Stockfish загружается'}
          </StatusChip>
        </div>
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
  if (e.score === null || e.scoreType === null) return '-';
  if (e.scoreType === 'mate') {
    const sign = e.score > 0 ? '+' : '';
    return `мат ${sign}${e.score}`;
  }
  const v = e.score / 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}`;
}
