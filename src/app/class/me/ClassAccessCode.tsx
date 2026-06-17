'use client';

import { useState } from 'react';

/**
 * Компактный контрол кода доступа в шапке класса.
 * • Нет кода → кнопка «Код доступа»: по клику генерирует 5-значный код и
 *   сохраняет на сервере (PATCH /api/class/me).
 * • Есть код, свёрнут → кнопка «🔒 Код доступа»: показывает код (НЕ меняет его).
 * • Есть код, развёрнут → код + копировать + «обновить» (новый код) + «✕» (свернуть).
 *
 * Важно: «✕» только сворачивает показ. Код остаётся паролем класса и меняется
 * ТОЛЬКО кнопкой «обновить». Свернуть ≠ убрать пароль.
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
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => undefined,
    );
  }

  // Кода ещё нет — кнопка генерации.
  if (!code) {
    return (
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title="Сгенерировать код доступа для входа учеников"
        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-paper px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        🔑 {busy ? 'Создаю…' : 'Код доступа'}
      </button>
    );
  }

  // Код есть, но скрыт — компактная кнопка. Код сохранён, класс под паролем.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Показать код доступа"
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/30"
      >
        🔒 Код доступа
      </button>
    );
  }

  // Код есть и показан.
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 dark:border-amber-700/60 dark:bg-amber-900/20">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Код доступа
      </span>
      <span className="font-mono text-sm font-semibold text-amber-800 dark:text-amber-200">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        title="Скопировать"
        className="text-xs text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
      >
        {copied ? 'скопировано' : 'копировать'}
      </button>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title="Сгенерировать новый код (старый перестанет работать)"
        className="text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline disabled:opacity-60 dark:hover:text-stone-200"
      >
        обновить
      </button>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        title="Свернуть — код останется паролем класса"
        className="text-sm leading-none text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
      >
        ✕
      </button>
    </div>
  );
}
