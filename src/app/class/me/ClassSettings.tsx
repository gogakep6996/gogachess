'use client';

import { useState } from 'react';

export interface ClassDto {
  id: string;
  slug: string;
  name: string | null;
  accessCode: string | null;
  isPublic: boolean;
  ownerName: string;
}

export function ClassSettings({
  cls,
  onUpdate,
}: {
  cls: ClassDto;
  onUpdate: (next: ClassDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(cls.name ?? '');
  const [accessCode, setAccessCode] = useState(cls.accessCode ?? '');
  const [isPublic, setIsPublic] = useState(cls.isPublic);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Генерируем простой 5-значный код — легко продиктовать ученикам.
  function generateCode() {
    const next = String(Math.floor(10000 + Math.random() * 90000));
    setAccessCode(next);
  }

  function copyCode() {
    if (!cls.accessCode) return;
    navigator.clipboard?.writeText(cls.accessCode).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/class/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          accessCode: accessCode.trim() || null,
          isPublic,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { class: Omit<ClassDto, 'ownerName'> };
        onUpdate({ ...cls, ...data.class });
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-stone-600 dark:text-stone-300">
          <span>{cls.isPublic ? '🔓 Класс публичный' : '🔒 Только по ссылке'}</span>
          {cls.accessCode ? (
            <span className="flex items-center gap-1.5">
              · код доступа:{' '}
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                {cls.accessCode}
              </span>
              <button
                onClick={copyCode}
                className="text-xs text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                title="Скопировать код"
              >
                {copied ? 'скопировано' : 'копировать'}
              </button>
            </span>
          ) : (
            <span>· без кода доступа — войти может любой</span>
          )}
        </div>
        <button onClick={() => setOpen(true)} className="btn-ghost text-xs">
          Настройки класса
        </button>
      </div>
    );
  }

  return (
    <div className="card grid gap-3 text-sm">
      <div>
        <label className="mb-1 block text-xs font-semibold text-stone-500">
          Название класса (необязательно)
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder={`Класс — ${cls.ownerName}`}
          className="w-full rounded border border-stone-300 bg-paper px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-stone-500">
          Код доступа (пусто = вход без кода)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            maxLength={32}
            placeholder="например 1234"
            className="w-44 rounded border border-stone-300 bg-paper px-3 py-1.5 font-mono dark:border-stone-700 dark:bg-stone-900"
          />
          <button type="button" onClick={generateCode} className="btn-ghost text-xs">
            🎲 Сгенерировать
          </button>
          {accessCode && (
            <button
              type="button"
              onClick={() => setAccessCode('')}
              className="text-xs text-stone-500 underline-offset-2 hover:underline"
            >
              убрать код
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Когда код задан, ученики вводят его при входе в класс (на странице класса
          или в разделе «Класс» → «Войти по коду»). Сохраните и отправьте код ученикам.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        <span>Показывать в общем каталоге классов</span>
      </label>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button onClick={() => setOpen(false)} className="btn-ghost text-xs">
          Отмена
        </button>
      </div>
    </div>
  );
}
