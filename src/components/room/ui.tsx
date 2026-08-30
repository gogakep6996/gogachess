'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Поверхности и органы управления комнаты урока.
 *
 * Одна шкала скруглений на весь экран комнаты, смешивать нельзя:
 *   панель — rounded-2xl, контрол — rounded-xl, ячейка/чип — rounded-lg.
 *
 * Акцентный цвет ровно один: brand. Красный и янтарный допустимы только как
 * настоящие состояния (опасное действие, запрет ходов), не как украшение.
 *
 * Минимальный кегль текста — 11px, интерактивных подписей — 12px: панели
 * узкие, но подписи должны читаться без прищуривания.
 */

/** Общая «бумага» панелей: тень тонирована под зелёно-серый фон комнаты. */
const PANEL_SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

export function Panel({
  title,
  icon: TitleIcon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  icon?: Icon;
  /** Кнопки в правом углу шапки (обновить, настройки и т.п.). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden', PANEL_SURFACE, className)}>
      {title && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-stone-900/[0.05] px-2.5 dark:border-white/[0.06]">
          <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-stone-700 dark:text-stone-200">
            {TitleIcon && (
              <TitleIcon
                size={14}
                weight="bold"
                aria-hidden
                className="shrink-0 text-stone-400 dark:text-stone-500"
              />
            )}
            <span className="truncate">{title}</span>
          </h2>
          {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName ?? 'p-2.5')}>{children}</div>
    </section>
  );
}

// ── Кнопки ────────────────────────────────────────────────────────────────

type Tone = 'primary' | 'neutral' | 'quiet' | 'danger' | 'warning';

const BASE_BUTTON =
  'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-semibold leading-none ' +
  'transition-colors duration-150 active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-40 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-1 ' +
  'focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900';

const TONE_CLASS: Record<Tone, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_1px_2px_rgba(28,83,59,0.35)] hover:bg-brand-700',
  neutral:
    'bg-stone-900/[0.05] text-stone-700 hover:bg-stone-900/[0.09] ' +
    'dark:bg-white/[0.07] dark:text-stone-100 dark:hover:bg-white/[0.12]',
  quiet:
    'text-stone-500 hover:bg-stone-900/[0.06] hover:text-stone-900 ' +
    'dark:text-stone-400 dark:hover:bg-white/[0.08] dark:hover:text-white',
  danger:
    'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 ' +
    'dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/60',
  warning:
    'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 ' +
    'dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/70 dark:hover:bg-amber-950/60',
};

/** Нажатое/включённое состояние — всегда в бренде, независимо от базового тона. */
const ACTIVE_CLASS =
  'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 ' +
  'dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800 dark:hover:bg-brand-900/60';

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: Icon;
  tone?: Tone;
  /** Контрол включён (тумблер в положении «вкл»). */
  active?: boolean;
  block?: boolean;
  size?: 'sm' | 'md';
}

export function ToolButton({
  icon: ButtonIcon,
  tone = 'neutral',
  active = false,
  block = false,
  size = 'sm',
  className,
  children,
  ...rest
}: ToolButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        BASE_BUTTON,
        size === 'sm' ? 'h-8 gap-1.5 px-2.5 text-[12px]' : 'h-9 gap-2 px-3 text-[13px]',
        active ? ACTIVE_CLASS : TONE_CLASS[tone],
        block && 'w-full',
        className,
      )}
    >
      {ButtonIcon && (
        <ButtonIcon size={size === 'sm' ? 15 : 16} weight="bold" aria-hidden className="shrink-0" />
      )}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: Icon;
  /** Идёт и в `title`, и в `aria-label`: кнопка без текста должна быть озвучена. */
  label: string;
  tone?: Tone;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton({
  icon: ButtonIcon,
  label,
  tone = 'quiet',
  active = false,
  size = 'sm',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={cn(
        BASE_BUTTON,
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        active ? ACTIVE_CLASS : TONE_CLASS[tone],
        className,
      )}
    >
      <ButtonIcon size={size === 'sm' ? 16 : 18} weight="bold" aria-hidden />
    </button>
  );
}

// ── Сегментированный переключатель ────────────────────────────────────────

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: Icon;
  /** Точка-индикатор реального состояния (например, движок сейчас играет). */
  dot?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (id: T) => void;
  options: SegmentOption<T>[];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-stone-900/[0.05] p-0.5 dark:bg-white/[0.06]',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              'relative flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-[12px] font-semibold leading-none',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
              disabled && 'cursor-not-allowed opacity-50',
              active
                ? 'bg-white text-brand-700 shadow-sm dark:bg-stone-800 dark:text-brand-200'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100',
            )}
          >
            {opt.icon && <opt.icon size={14} weight="bold" aria-hidden className="shrink-0" />}
            <span className="truncate">{opt.label}</span>
            {opt.dot && (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Строка-тумблер ────────────────────────────────────────────────────────

/**
 * Полноширинная строка с подписью и переключателем. Используется там, где
 * состояние важнее действия: «ученики могут ходить», «движок играет».
 */
export function SwitchRow({
  icon: RowIcon,
  label,
  hint,
  checked,
  onChange,
  tone = 'brand',
  disabled = false,
}: {
  icon?: Icon;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Цвет включённого состояния: brand — норма, amber — ограничение. */
  tone?: 'brand' | 'amber';
  disabled?: boolean;
}) {
  const onColor = tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
        'disabled:pointer-events-none disabled:opacity-40',
        checked
          ? 'bg-stone-900/[0.05] dark:bg-white/[0.07]'
          : 'bg-stone-900/[0.03] hover:bg-stone-900/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]',
      )}
    >
      {RowIcon && (
        <RowIcon
          size={16}
          weight="bold"
          aria-hidden
          className={cn(
            'shrink-0',
            checked ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500',
          )}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-stone-700 dark:text-stone-100">
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? onColor : 'bg-stone-300 dark:bg-stone-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

// ── Мелочи ────────────────────────────────────────────────────────────────

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium text-stone-500 dark:text-stone-400">
      {children}
    </span>
  );
}

export function StatusChip({
  tone = 'neutral',
  live = false,
  children,
}: {
  tone?: 'neutral' | 'brand' | 'amber' | 'red';
  /** Пульсирующая точка — только для действительно живого состояния. */
  live?: boolean;
  children: ReactNode;
}) {
  const map = {
    neutral: 'bg-stone-900/[0.05] text-stone-600 dark:bg-white/[0.07] dark:text-stone-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  } as const;
  const dot = {
    neutral: 'bg-stone-400',
    brand: 'bg-brand-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-semibold leading-none',
        map[tone],
      )}
    >
      {live && (
        <span aria-hidden className={cn('h-1.5 w-1.5 animate-pulse rounded-full', dot[tone])} />
      )}
      {children}
    </span>
  );
}

/** Пустое состояние панели: одна строка, без иллюстраций и восклицаний. */
export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-6 text-center text-[12px] leading-snug text-stone-400 dark:text-stone-500">
      {children}
    </p>
  );
}
