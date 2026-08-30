'use client';

import { useState } from 'react';
import { ArrowsClockwise, Check, Copy, Key, Lock, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Код доступа класса в шапке.
 * • Кода нет → кнопка «Код доступа»: по клику генерирует 5-значный код.
 * • Код есть, свёрнут → кнопка с замком: показывает код (НЕ меняет его).
 * • Код есть, развёрнут → сам код + копировать + сменить + свернуть.
 *
 * «Свернуть» ≠ «убрать пароль»: код остаётся паролем класса и меняется только
 * кнопкой смены. Поэтому свёрнутое состояние тоже янтарное — класс закрыт.
 */
export function ClassAccessCode({ initialCode }: { initialCode: string | null }) {
  const [code, setCode] = useState<string | null>(initialCode);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save(next: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/class/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessCode: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as { class: { accessCode: string | null } };
        setCode(data.class.accessCode);
        setExpanded(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function generate() {
    save(String(Math.floor(10000 + Math.random() * 90000)));
  }

  function copy() {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  }

  const CHIP =
    'inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold ' +
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-brand-500/45 disabled:opacity-50';

  if (!code) {
    return (
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title="Закрыть класс кодом: без него ученики не войдут"
        className={cn(
          CHIP,
          'bg-stone-900/[0.05] text-stone-600 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]',
        )}
      >
        <Key size={14} weight="bold" aria-hidden />
        {busy ? 'Создаём…' : 'Код доступа'}
      </button>
    );
  }

  const AMBER =
    'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300/70 ' +
    'dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800';

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Показать код доступа"
        className={cn(CHIP, AMBER, 'hover:bg-amber-100 dark:hover:bg-amber-950/60')}
      >
        <Lock size={14} weight="bold" aria-hidden />
        Код доступа
      </button>
    );
  }

  const MINI =
    'grid h-6 w-6 place-items-center rounded-lg transition-colors duration-150 ' +
    'hover:bg-amber-900/10 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-brand-500/45 disabled:opacity-50 dark:hover:bg-amber-100/10';

  return (
    <div className={cn('inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5', AMBER)}>
      <Lock size={14} weight="bold" aria-hidden className="shrink-0" />
      <span className="font-mono text-[13px] font-bold tracking-wider tabular-nums">{code}</span>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-amber-700/20 dark:bg-amber-200/20" />
      <button type="button" onClick={copy} title="Скопировать код" className={MINI}>
        {copied ? (
          <Check size={13} weight="bold" aria-hidden />
        ) : (
          <Copy size={13} weight="bold" aria-hidden />
        )}
        <span className="sr-only">Скопировать код</span>
      </button>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title="Сменить код — старый перестанет работать"
        className={MINI}
      >
        <ArrowsClockwise size={13} weight="bold" aria-hidden />
        <span className="sr-only">Сменить код</span>
      </button>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        title="Скрыть код — класс останется закрытым"
        className={MINI}
      >
        <X size={13} weight="bold" aria-hidden />
        <span className="sr-only">Скрыть код</span>
      </button>
    </div>
  );
}
