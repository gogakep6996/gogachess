'use client';

import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check, Folder } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { POPOVER } from './ui';
import type { FolderDto } from '@/app/class/me/TasksLibrary';

/**
 * Мульти-выбор папок для одной задачи: задача может лежать сразу в нескольких.
 * `selectedIds` — папки нужного набора (домашки или библиотека), в которых
 * задача уже есть.
 *
 * Список раскрывается вверх и поверх соседей: карточки стоят плотной сеткой,
 * и вставка в поток раздвигала бы весь ряд.
 */
export function FolderPicker({
  selectedIds,
  folders,
  onToggle,
  emptyLabel = 'Не в папках',
  className,
}: {
  selectedIds: string[];
  folders: FolderDto[];
  onToggle: (folderId: string) => void;
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (folders.length === 0) return null;
  const count = selectedIds.length;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="В каких папках лежит позиция"
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-lg px-1.5 text-[11px] font-medium',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
          count > 0
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200'
            : 'bg-stone-900/[0.05] text-stone-500 hover:bg-stone-900/[0.09] dark:bg-white/[0.06] dark:text-stone-400',
        )}
      >
        <Folder size={12} weight="bold" aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {count === 0 ? emptyLabel : `В папках: ${count}`}
        </span>
        <CaretDown
          size={11}
          weight="bold"
          aria-hidden
          className={cn('shrink-0 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          className={cn(
            'absolute bottom-full left-0 z-40 mb-1 max-h-48 w-full min-w-[10rem] overflow-y-auto overscroll-contain p-1',
            POPOVER,
          )}
        >
          {folders.map((f) => {
            const on = selectedIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onToggle(f.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11px]',
                  'transition-colors duration-150 hover:bg-stone-900/[0.05] dark:hover:bg-white/[0.07]',
                  on
                    ? 'font-semibold text-brand-700 dark:text-brand-300'
                    : 'text-stone-600 dark:text-stone-300',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid h-3.5 w-3.5 shrink-0 place-items-center rounded',
                    on
                      ? 'bg-brand-600 text-white'
                      : 'ring-1 ring-inset ring-stone-300 dark:ring-stone-600',
                  )}
                >
                  {on && <Check size={9} weight="bold" />}
                </span>
                <span className="truncate">{f.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
