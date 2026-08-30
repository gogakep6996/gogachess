'use client';

import type { RoomMode } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import { FieldLabel, Segmented, type SegmentOption } from './ui';

interface Props {
  mode: RoomMode;
  /** Доступно ли изменение (учитель). Для остальных — режим показывается read-only. */
  canEdit: boolean;
  onChange: (partial: Partial<RoomMode>) => void;
  className?: string;
}

/** Внутренние id сегментов: `null` нельзя использовать как ключ вкладки. */
type SideId = 'any' | 'w' | 'b';

const SIDE_OPTIONS: SegmentOption<SideId>[] = [
  { id: 'any', label: 'Оба' },
  { id: 'w', label: 'Белые' },
  { id: 'b', label: 'Чёрные' },
];

/**
 * Кто может ходить на доске. Живёт внутри панели инструментов учителя, поэтому
 * своей рамки не рисует: только подпись и сегментированный переключатель.
 */
export function ModePanel({ mode, canEdit, onChange, className }: Props) {
  const value: SideId = mode.sideLock ?? 'any';
  return (
    <div className={cn('w-full', className)}>
      <FieldLabel>Чей ход</FieldLabel>
      <Segmented
        ariaLabel="Чей ход"
        value={value}
        disabled={!canEdit}
        options={SIDE_OPTIONS}
        onChange={(id) => onChange({ sideLock: id === 'any' ? null : id })}
      />
    </div>
  );
}
