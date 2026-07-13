'use client';

import type { FolderDto } from '@/app/class/me/TasksLibrary';

/** Мульти-выбор папок для одной задачи: одна задача может лежать сразу
 *  в нескольких папках. Клик по папке добавляет/убирает её.
 *  `selectedIds` — id папок (нужного набора: ДЗ или библиотека), в которых
 *  задача уже лежит. */
export function FolderPicker({
  selectedIds,
  folders,
  onToggle,
  emptyLabel = 'Без папки',
}: {
  selectedIds: string[];
  folders: FolderDto[];
  onToggle: (folderId: string) => void;
  emptyLabel?: string;
}) {
  if (folders.length === 0) return null;
  const count = selectedIds.length;
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-stone-300 bg-stone-50 px-1.5 py-1 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
        <span className="truncate">{count === 0 ? emptyLabel : `В папках: ${count}`}</span>
        <span className="ml-1 shrink-0 text-stone-400">▾</span>
      </summary>
      <div className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-44 overflow-auto rounded-md border border-stone-200 bg-paper p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
        {folders.map((f) => {
          const on = selectedIds.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onToggle(f.id)}
              className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-stone-100 dark:hover:bg-stone-800 ${
                on
                  ? 'font-semibold text-brand-600 dark:text-brand-300'
                  : 'text-stone-600 dark:text-stone-300'
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                  on
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-stone-300 dark:border-stone-600'
                }`}
              >
                {on ? '✓' : ''}
              </span>
              <span className="truncate">{f.name}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
