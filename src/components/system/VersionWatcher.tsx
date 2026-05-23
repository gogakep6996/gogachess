'use client';

// Глобальный наблюдатель за версией сервера.
// При первом маунте запоминает текущую версию (/api/version), затем раз в минуту
// перепроверяет. Если версия сменилась (= сервер был пересобран и перезапущен),
// показывает ненавязчивый баннер с кнопкой «Обновить» — пользователь делает один
// клик и получает свежую сборку без необходимости вручную нажимать Ctrl+Shift+R.
//
// Бережём ресурс: при скрытой вкладке (document.hidden) не пингуем.
// При возвращении фокуса делаем внеплановую проверку.

import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

export function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let initialVersion: string | null = null;

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled || !data.version) return;
        if (initialVersion === null) {
          initialVersion = data.version;
        } else if (data.version !== initialVersion) {
          setUpdateAvailable(true);
        }
      } catch {
        // сеть моргнула — не страшно, попробуем в следующий тик
      }
    }

    void check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex max-w-[90vw] items-center gap-3 rounded-xl border border-brand-300 bg-white px-4 py-2.5 shadow-xl dark:border-brand-700 dark:bg-stone-900"
    >
      <span className="text-sm text-stone-700 dark:text-stone-200">
        Доступно обновление сайта
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Обновить
      </button>
    </div>
  );
}
