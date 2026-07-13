import { cn } from '@/lib/utils';

/** Двухцветная «объёмная» иконка папки (задняя стенка с язычком + передняя
 *  створка) — как классическая папка на скрине. Цвета берутся из бренда. */
export function FolderGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden="true">
      {/* задняя часть с язычком-табом */}
      <path
        d="M4 10c0-2.2 1.8-4 4-4h13.7c1.05 0 2.06.42 2.8 1.17L28 11h28c2.2 0 4 1.8 4 4v33c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4V10Z"
        className="fill-brand-700 dark:fill-brand-800"
      />
      {/* передняя створка */}
      <path
        d="M4 22h56v26c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4V22Z"
        className="fill-brand-500 dark:fill-brand-600"
      />
      {/* лёгкий блик по верху створки */}
      <path d="M4 22h56v3.5H4z" className="fill-white/10" />
    </svg>
  );
}

/** Вертикальная плитка папки: крупная иконка + название (+ счётчик), в стиле
 *  скрина. Используется в «Моей библиотеке» и в панели «Библиотека» редактора. */
export function FolderTile({
  name,
  count,
  muted,
  onOpen,
  onRename,
  onDelete,
  graphicClassName = 'h-16 w-20',
}: {
  name: string;
  count?: number;
  muted?: boolean;
  onOpen: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  graphicClassName?: string;
}) {
  return (
    <div
      className={cn(
        'group relative flex flex-col items-center rounded-2xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        muted
          ? 'border-dashed border-stone-300 bg-stone-50/60 dark:border-stone-700 dark:bg-stone-900/40'
          : 'border-stone-200/80 bg-paper dark:border-stone-800/80 dark:bg-stone-900',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col items-center gap-1.5"
        title={`Открыть «${name}»`}
      >
        <FolderGraphic className={cn(graphicClassName, muted && 'opacity-50 grayscale')} />
        <span className="line-clamp-2 w-full text-center text-sm font-semibold leading-tight">
          {name}
        </span>
        {count != null && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {count} шт
          </span>
        )}
      </button>
      {(onRename || onDelete) && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              title="Переименовать"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-xs text-stone-500 shadow-sm hover:bg-stone-100 hover:text-stone-700 dark:bg-stone-800/90 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Удалить папку"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-xs text-red-500 shadow-sm hover:bg-red-50 dark:bg-stone-800/90 dark:hover:bg-red-900/30"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  );
}
