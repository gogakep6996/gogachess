'use client';

// Создание турнира. Форма разворачивается на странице, а не в окне поверх неё:
// полей мало, и прятать список за модальным окном незачем.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PencilSimpleLine, Plus, X } from '@phosphor-icons/react';

import { ChessBoard } from '@/components/chess/ChessBoard';
import { FieldLabel, ToolButton } from '@/components/room/ui';
import { checkStartFen } from '@/lib/arena-fen';
import { ARENA_DURATIONS, ARENA_TIME_CONTROLS } from '@/lib/socket-events';
import { formatDuration } from '@/components/arena/time';
import { cn } from '@/lib/utils';

const SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

function Chips<T extends string | number>({
  value,
  options,
  onChange,
  labelOf,
}: {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  labelOf: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt)}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={opt === value}
          className={cn(
            'h-8 rounded-xl px-2.5 text-[12px] font-semibold leading-none transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
            opt === value
              ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800'
              : 'bg-stone-900/[0.05] text-stone-700 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-100 dark:hover:bg-white/[0.12]',
          )}
        >
          {labelOf(opt)}
        </button>
      ))}
    </div>
  );
}

/** Значение для поля datetime-local: местное время без секунд. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Старт по умолчанию: ближайшие круглые 15 минут, но не раньше чем через 5. */
function defaultStart(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return toLocalInputValue(d);
}

export function CreateArenaForm() {
  const router = useRouter();
  // Позиция может прийти ссылкой из редактора доски — тогда форма сразу
  // открыта с готовым FEN, копировать руками не нужно.
  const fenFromEditor = useSearchParams().get('fen');
  const [open, setOpen] = useState(fenFromEditor !== null);
  const [name, setName] = useState('');
  const [timeControl, setTimeControl] = useState<string>('blitz-3+2');
  const [durationMin, setDurationMin] = useState<number>(30);
  const [startsAt, setStartsAt] = useState<string>(defaultStart);
  const [accessCode, setAccessCode] = useState('');
  const [startFen, setStartFen] = useState<string>(fenFromEditor ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ту же проверку делает сервер при создании: здесь она нужна, чтобы ошибку
  // было видно сразу, а не после отправки.
  const position = useMemo(() => checkStartFen(startFen), [startFen]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/arenas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          timeControl,
          durationMin,
          startsAt: new Date(startsAt).toISOString(),
          accessCode,
          startFen,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? 'Не удалось создать турнир');
        return;
      }
      router.push(`/tournaments/${data.id}`);
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-4 py-2 text-sm">
        <Plus size={15} weight="bold" aria-hidden />
        Создать турнир
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className={cn('p-3 sm:p-4', SURFACE)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-stone-800 dark:text-stone-100">
            Новый турнир
          </h2>
          <ToolButton icon={X} tone="quiet" onClick={() => setOpen(false)}>
            Закрыть
          </ToolButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel>Название</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Например: Вечерний блиц"
              className="input py-2 text-sm"
            />
          </div>

          <div>
            <FieldLabel>Контроль времени</FieldLabel>
            <Chips
              value={timeControl}
              options={ARENA_TIME_CONTROLS.map((t) => t.id)}
              onChange={setTimeControl}
              labelOf={(id) => ARENA_TIME_CONTROLS.find((t) => t.id === id)?.label ?? id}
            />
          </div>

          <div>
            <FieldLabel>Сколько идёт турнир</FieldLabel>
            <Chips
              value={durationMin}
              options={ARENA_DURATIONS}
              onChange={setDurationMin}
              labelOf={(m) => `${m} мин`}
            />
          </div>

          <div>
            <FieldLabel>Начало</FieldLabel>
            <input
              type="datetime-local"
              value={startsAt}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setStartsAt(e.target.value)}
              className="input py-2 text-sm"
            />
          </div>

          <div>
            <FieldLabel>Код доступа, если турнир только для своих</FieldLabel>
            <input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              maxLength={32}
              placeholder="Не обязательно"
              className="input py-2 text-sm"
            />
          </div>

          {/* Начальная позиция всех партий: пусто — обычная расстановка. */}
          <div className="sm:col-span-2">
            <FieldLabel>Начальная позиция</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <input
                  value={startFen}
                  onChange={(e) => setStartFen(e.target.value)}
                  spellCheck={false}
                  maxLength={120}
                  placeholder="Пусто — партии начнутся со стандартной позиции"
                  aria-label="FEN начальной позиции"
                  aria-invalid={position.error !== null}
                  className="input py-2 font-mono text-[12px]"
                />
                <p className="mt-1.5 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                  Вставьте FEN, чтобы каждая партия турнира начиналась с заданной позиции.{' '}
                  <Link
                    href="/editor"
                    className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:decoration-brand-700"
                  >
                    Редактор доски
                  </Link>{' '}
                  соберёт позицию и выдаст готовый FEN, в том числе с ходом чёрных. В таком
                  турнире партию не отменяют за долгий первый ход, но часы идут сразу
                  у того, чья очередь.
                </p>
                {position.error && (
                  <p className="mt-1.5 rounded-xl bg-red-50 px-2.5 py-2 text-[12.5px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    {position.error}
                  </p>
                )}
              </div>

              {/* Превью: сразу видно, что вставили именно ту позицию. */}
              {position.fen && (
                <div className="shrink-0">
                  <div className="w-[8.5rem] overflow-hidden rounded-lg ring-1 ring-stone-900/[0.07] dark:ring-white/[0.08]">
                    <ChessBoard
                      fen={position.fen}
                      canMove={false}
                      isEditing={false}
                      canEdit={false}
                      compact
                      silent
                    />
                  </div>
                  <Link
                    href={`/editor?fen=${encodeURIComponent(position.fen)}`}
                    className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-300"
                  >
                    <PencilSimpleLine size={12} weight="bold" aria-hidden />
                    Поправить позицию
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
          Турнир будет принимать новые пары {formatDuration(durationMin)}. Партии,
          начатые до конца времени, доигрываются полностью и идут в зачёт.
        </p>

        {error && (
          <p className="mt-2 rounded-xl bg-red-50 px-2.5 py-2 text-[12.5px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-3 flex justify-end">
          <ToolButton
            size="md"
            tone="primary"
            onClick={submit}
            disabled={busy || position.error !== null}
          >
            {busy ? 'Создаём' : 'Создать турнир'}
          </ToolButton>
        </div>
      </div>
    </div>
  );
}
