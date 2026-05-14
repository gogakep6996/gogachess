'use client';

import { useEffect, useRef } from 'react';
import type { MoveHistoryEntry } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface Props {
  history: MoveHistoryEntry[];
  /** Текущий просматриваемый индекс хода (-1 = стартовая позиция, history.length-1 = последний). */
  viewIdx: number;
  onSelect: (idx: number) => void;
  className?: string;
}

export function HistoryPanel({ history, viewIdx, onSelect, className }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Автопрокрутка к выбранному ходу — удобно когда история длиннее окна.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [viewIdx]);

  const pairs: { num: number; w?: { idx: number; san: string; legal: boolean }; b?: { idx: number; san: string; legal: boolean } }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      w: { idx: i, san: history[i].san, legal: history[i].legal },
      b: history[i + 1]
        ? { idx: i + 1, san: history[i + 1].san, legal: history[i + 1].legal }
        : undefined,
    });
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col rounded-xl border border-stone-200/80 bg-white/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200/70 px-2 py-1 dark:border-stone-800/70">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          История
        </h3>
        <span className="text-[10px] text-stone-400">
          {history.length} {history.length === 1 ? 'ход' : history.length >= 2 && history.length <= 4 ? 'хода' : 'ходов'}
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {history.length === 0 ? (
          <div className="px-1 py-2 text-center text-[11px] text-stone-400">
            Пока ходов нет
          </div>
        ) : (
          <ol className="space-y-0.5">
            <li>
              <button
                type="button"
                data-active={viewIdx === -1}
                onClick={() => onSelect(-1)}
                className={cn(
                  'w-full rounded px-1.5 py-0.5 text-left text-[11px] transition',
                  viewIdx === -1
                    ? 'bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800',
                )}
              >
                Старт партии
              </button>
            </li>
            {pairs.map(({ num, w, b }) => (
              <li key={num} className="flex items-center gap-1 text-[11px] tabular-nums">
                <span className="w-5 shrink-0 text-right text-stone-400">{num}.</span>
                {w && (
                  <SanCell entry={w} active={viewIdx === w.idx} onClick={() => onSelect(w.idx)} />
                )}
                {b && (
                  <SanCell entry={b} active={viewIdx === b.idx} onClick={() => onSelect(b.idx)} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SanCell({
  entry,
  active,
  onClick,
}: {
  entry: { san: string; legal: boolean };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      title={entry.legal ? entry.san : `${entry.san} · нелегальный`}
      className={cn(
        'flex-1 truncate rounded px-1.5 py-0.5 text-left font-medium transition',
        active
          ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
          : 'hover:bg-stone-100 dark:hover:bg-stone-800',
        !entry.legal && 'italic text-amber-700 dark:text-amber-300',
      )}
    >
      {entry.san}
    </button>
  );
}
