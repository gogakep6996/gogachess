'use client';

import type { RoomMode } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface Props {
  mode: RoomMode;
  /** Доступно ли изменение (учитель). Для остальных — режим показывается read-only. */
  canEdit: boolean;
  onChange: (partial: Partial<RoomMode>) => void;
  className?: string;
}

export function ModePanel({ mode, canEdit, onChange, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200/80 bg-paper/70 p-2 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        className,
      )}
    >
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Режим
      </h3>

      <div className="space-y-1.5">
        <SideRow
          value={mode.sideLock}
          disabled={!canEdit}
          onChange={(v) => onChange({ sideLock: v })}
        />
      </div>
    </div>
  );
}

function SideRow({
  value,
  disabled,
  onChange,
}: {
  value: 'w' | 'b' | null;
  disabled: boolean;
  onChange: (v: 'w' | 'b' | null) => void;
}) {
  const options: { id: 'w' | 'b' | null; label: string }[] = [
    { id: null, label: 'оба' },
    { id: 'w', label: 'белые' },
    { id: 'b', label: 'чёрные' },
  ];
  return (
    <div className="rounded-md px-1.5 py-1">
      <div className="mb-1 text-[11px] font-medium text-stone-700 dark:text-stone-200">
        Чей ход
      </div>
      <div className="grid grid-cols-3 gap-1">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={String(opt.id)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded px-1.5 py-1 text-[10px] font-medium transition',
                active
                  ? 'bg-brand-500 text-white shadow-soft'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
