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
        'rounded-xl border border-stone-200/80 bg-white/70 p-2 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        className,
      )}
    >
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Режим
      </h3>

      <div className="space-y-1.5">
        <ToggleRow
          label="Любые ходы"
          hint="Без правил шахмат — фигура двигается куда угодно. Подсказка легальных ходов остаётся."
          checked={mode.allowIllegal}
          disabled={!canEdit}
          onChange={(v) => onChange({ allowIllegal: v })}
        />
        <SideRow
          value={mode.sideLock}
          disabled={!canEdit}
          onChange={(v) => onChange({ sideLock: v })}
        />
        <ToggleRow
          label="Ученикам можно править"
          hint="Когда учитель открыл редактор — ученики тоже могут переставлять фигуры."
          checked={mode.studentsCanEdit}
          disabled={!canEdit}
          onChange={(v) => onChange({ studentsCanEdit: v })}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[11px]',
        disabled ? 'cursor-not-allowed opacity-70' : 'hover:bg-stone-100/70 dark:hover:bg-stone-800/40',
      )}
      title={hint}
    >
      <span className="min-w-0 truncate font-medium text-stone-700 dark:text-stone-200">
        {label}
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
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
