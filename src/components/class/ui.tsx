'use client';

import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Поверхности и блоки страниц класса.
 *
 * Класс говорит на том же языке, что и комната урока (`components/room/ui`):
 * та же шкала скруглений (панель 2xl, контрол xl, чип lg), тот же единственный
 * акцент brand, те же иконки Phosphor. Здесь живёт только то, чего в комнате
 * нет: полосы режимов урока, карточки-плитки и заголовки разделов.
 */

/** Та же «бумага», что у панелей комнаты: класс и урок — одна поверхность. */
export const SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

/**
 * Поверхность всплывающего слоя: список раздачи, выбор папок.
 *
 * В отличие от `SURFACE` — непрозрачная и с заметно более глубокой тенью:
 * слой висит над пёстрой сеткой доск, и полупрозрачность превратила бы его
 * в кашу из клеток и текста.
 */
export const POPOVER =
  'rounded-2xl bg-white ring-1 ring-stone-900/10 ' +
  'shadow-[0_4px_10px_-2px_rgba(35,48,40,0.12),0_24px_48px_-16px_rgba(35,48,40,0.35)] ' +
  'dark:bg-stone-800 dark:ring-white/[0.12]';

/**
 * Полоса режима над доской: «вторжение», «моя доска», «трансляция», «домашка».
 *
 * Держит фиксированную высоту и не переносится: доска под ней не должна
 * прыгать при смене подписи. Слева — что происходит, справа — как выйти.
 */
export function ModeBar({
  icon: BarIcon,
  tone = 'neutral',
  live = false,
  title,
  subtitle,
  children,
}: {
  icon: Icon;
  /** brand — идёт трансляция, amber — вы на чужой доске, neutral — обычный режим. */
  tone?: 'neutral' | 'brand' | 'amber';
  live?: boolean;
  title: ReactNode;
  subtitle?: string;
  /** Кнопки выхода и переключения режима. */
  children?: ReactNode;
}) {
  const skin = {
    neutral:
      'bg-white/85 text-stone-700 ring-stone-900/[0.07] dark:bg-stone-900/70 dark:text-stone-200 dark:ring-white/[0.08]',
    brand:
      'bg-brand-50/90 text-brand-800 ring-brand-600/15 dark:bg-brand-950/50 dark:text-brand-100 dark:ring-brand-400/20',
    amber:
      'bg-amber-50/90 text-amber-900 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-400/20',
  }[tone];
  const iconSkin = {
    neutral: 'bg-stone-900/[0.06] text-stone-500 dark:bg-white/[0.08] dark:text-stone-300',
    brand: 'bg-brand-600 text-white',
    amber: 'bg-amber-500 text-white',
  }[tone];

  return (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-2.5 px-2.5 ring-1 backdrop-blur-sm sm:px-3',
        skin,
      )}
    >
      <span
        aria-hidden
        className={cn('relative grid h-7 w-7 shrink-0 place-items-center rounded-xl', iconSkin)}
      >
        <BarIcon size={16} weight="bold" />
        {live && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-red-500 ring-2 ring-white dark:ring-stone-900" />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{title}</span>
        {subtitle && (
          <span className="block truncate text-[11px] opacity-70">{subtitle}</span>
        )}
      </span>
      {children && <span className="flex shrink-0 items-center gap-1.5">{children}</span>}
    </div>
  );
}

/** Заголовок раздела страницы: подпись слева, счётчик и действия справа. */
export function SectionHead({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0">
        <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-stone-800 dark:text-stone-100">
          {title}
          {count !== undefined && (
            <span className="text-[13px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
              {count}
            </span>
          )}
        </h2>
        {hint && (
          <p className="mt-0.5 text-[12px] leading-snug text-stone-500 dark:text-stone-400">
            {hint}
          </p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * Пустое состояние раздела: одна мысль и, если есть, одно действие.
 * Без иллюстраций, восклицательных знаков и советов в три абзаца.
 */
export function EmptyState({
  icon: StateIcon,
  title,
  hint,
  children,
}: {
  icon?: Icon;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        SURFACE,
      )}
    >
      {StateIcon && (
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-2xl bg-stone-900/[0.05] text-stone-400 dark:bg-white/[0.06] dark:text-stone-500"
        >
          <StateIcon size={20} weight="bold" />
        </span>
      )}
      <p className="text-[14px] font-semibold text-stone-700 dark:text-stone-200">{title}</p>
      {hint && (
        <p className="max-w-sm text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
          {hint}
        </p>
      )}
      {children && <div className="mt-1 flex flex-wrap justify-center gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * Плитка папки: иконка, название, счётчик, стрелка. Одна форма и для
 * библиотеки учителя, и для домашек ученика — папка везде выглядит одинаково.
 */
export function FolderTile({
  icon: TileIcon,
  name,
  count,
  countLabel = 'шт',
  onClick,
  children,
}: {
  icon: Icon;
  name: string;
  count: number;
  countLabel?: string;
  onClick: () => void;
  /** Действия в углу (переименовать, удалить) — появляются при наведении. */
  children?: ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 p-3 text-left transition-colors duration-150',
          'hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
          'dark:hover:bg-brand-950/40',
          SURFACE,
        )}
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-700 transition-colors duration-150 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-400/15 dark:text-brand-300"
        >
          <TileIcon size={20} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">
            {name}
          </span>
          <span className="mt-0.5 block text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
            {count} {countLabel}
          </span>
        </span>
        <CaretRight
          size={14}
          weight="bold"
          aria-hidden
          className="shrink-0 text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-stone-600"
        />
      </button>
      {children && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Карточка с мини-доской: общий каркас для задачи в библиотеке, домашки
 * у ученика и живой доски ученика в сетке урока. Доска всегда квадратная и
 * тянется по ширине карточки, поэтому ряды сетки ровные при любом числе колонок.
 */
export function BoardCard({
  board,
  title,
  meta,
  badge,
  actions,
  footer,
  active = false,
  onClick,
  tooltip,
}: {
  board: ReactNode;
  title: string;
  meta?: ReactNode;
  /** Левый верхний угол доски: статус, сложность, отметка «решено». */
  badge?: ReactNode;
  /**
   * Правый верхний угол доски: редкие действия (правка, удаление). Прячутся
   * до наведения — в сетке из тридцати карточек постоянные иконки создают шум.
   */
  actions?: ReactNode;
  /** Ряд кнопок под подписью. Если задан — карточка не кликается целиком. */
  footer?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tooltip?: string;
}) {
  const clickable = !!onClick && !footer;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      {...(clickable ? { type: 'button' as const, onClick, title: tooltip } : {})}
      className={cn(
        'group/card relative flex flex-col gap-2 p-2 text-left transition-all duration-150',
        // Карточка с открытым выбором папок должна встать над соседями:
        // backdrop-blur делает каждую карточку своим контекстом наложения,
        // и без этого список папок ушёл бы под следующую карточку ряда.
        'focus-within:z-30',
        SURFACE,
        active && 'ring-2 ring-brand-500 dark:ring-brand-400',
        clickable &&
          'hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(35,48,40,0.04),0_18px_36px_-20px_rgba(35,48,40,0.5)] ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
      )}
    >
      <div className="relative overflow-hidden rounded-xl ring-1 ring-stone-900/[0.06] dark:ring-white/[0.08]">
        {board}
        {badge && (
          <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-wrap gap-1">
            {badge}
          </div>
        )}
        {actions && (
          <div
            className={cn(
              'absolute right-1.5 top-1.5 flex gap-1 transition-opacity duration-150',
              'opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100',
              // На тач-устройствах наведения нет — там иконки видны всегда.
              '[@media(hover:none)]:opacity-100',
            )}
          >
            {actions}
          </div>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <div
          className="truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100"
          title={title}
        >
          {title}
        </div>
        {meta && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
            {meta}
          </div>
        )}
      </div>
      {footer && (
        <div className="flex flex-col gap-1.5 px-0.5 pb-0.5">{footer}</div>
      )}
    </Tag>
  );
}

/**
 * Сетка карточек с досками. Колонки подбираются автоматически под ширину,
 * поэтому и три ученика, и тридцать выглядят одинаково опрятно.
 */
export function BoardGrid({
  min = '11rem',
  children,
}: {
  /** Минимальная ширина карточки: сетка урока плотнее, витрина домашек крупнее. */
  min?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid gap-2.5"
      style={{
        // `min(…, 48%)` спасает телефон: без него минимум в 13rem не помещается
        // дважды в 390 px, сетка схлопывается в одну колонку и доска
        // раздувается на весь экран. С ним на узком экране всегда две колонки.
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 48%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
