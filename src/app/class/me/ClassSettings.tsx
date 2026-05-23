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
            <span>· код доступа: <span className="font-mono">{cls.accessCode}</span></span>
          ) : (
            <span>· без кода доступа</span>
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
          className="w-full rounded border border-stone-300 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-stone-500">
          Код доступа (4–6 цифр / символов; пусто = без кода)
        </label>
        <input
          type="text"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          maxLength={32}
          placeholder="например 1234"
          className="w-44 rounded border border-stone-300 bg-white px-3 py-1.5 font-mono dark:border-stone-700 dark:bg-stone-900"
        />
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
