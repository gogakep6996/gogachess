'use client';

import { useState } from 'react';

/**
 * Кнопка «Разослать письма подтверждения» на странице /admin/users.
 * Шлёт письмо каждому пользователю с почтой, но без подтверждения.
 */
export function ResendVerificationsButton({ pendingCount }: { pendingCount: number }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (
      !confirm(
        `Отправить письмо подтверждения всем (${pendingCount}) пользователям с неподтверждённой почтой?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/resend-verifications', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        sent?: number;
        total?: number;
        failed?: string[];
        error?: string;
      };
      if (res.ok && data.ok) {
        const failed = data.failed ?? [];
        setResult(
          failed.length === 0
            ? `Отправлено: ${data.sent} из ${data.total}.`
            : `Отправлено: ${data.sent} из ${data.total}. Не дошло: ${failed.join(', ')}`,
        );
      } else {
        setResult(`Ошибка: ${data.error || res.status}`);
      }
    } catch {
      setResult('Ошибка сети.');
    } finally {
      setBusy(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={run} disabled={busy} className="btn-primary text-xs">
        {busy ? 'Рассылаем…' : `✉ Разослать письма подтверждения (${pendingCount})`}
      </button>
      {result && (
        <p className="max-w-md text-right text-xs text-stone-500 dark:text-stone-400">{result}</p>
      )}
    </div>
  );
}
