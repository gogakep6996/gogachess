'use client';

// Редактор доски. Нужен, чтобы собрать позицию руками и получить готовый FEN:
// его вставляют в форму создания турнира, и тогда все партии арены начинаются
// не со стандартной расстановки, а с заданной. Поэтому под доской сразу
// показана строка FEN с кнопкой «Копировать» и ссылка, которая уносит позицию
// в форму создания турнира без копирования вручную.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowsClockwise,
  ArrowsDownUp,
  Check,
  Copy,
  Eraser,
  Trophy,
  Warning,
} from '@phosphor-icons/react';

import { ChessBoard } from '@/components/chess/ChessBoard';
import { FieldLabel, Segmented, ToolButton } from '@/components/room/ui';
import { checkStartFen } from '@/lib/arena-fen';
import { deriveCastlingRights, emptyFen, setSideToMove, sideToMove } from '@/lib/fen';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

const SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

export function EditorClient() {
  const params = useSearchParams();
  // Позицию можно принести ссылкой: так работает переход «поправить позицию»
  // из формы создания турнира.
  const initial = params.get('fen');
  const [fen, setFen] = useState<string>(() => (initial ? initial.trim() : STARTING_FEN));
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = useMemo(() => checkStartFen(fen), [fen]);
  const isStandard = check.error === null && check.fen === null;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  /** Правки на доске: права на рокировку выводим из расстановки, как в комнате. */
  const onEdit = (next: string) => setFen(deriveCastlingRights(next));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // Готовую позицию уносим в форму создания турнира параметром ссылки.
  const createHref = check.fen
    ? `/tournaments?fen=${encodeURIComponent(check.fen)}`
    : '/tournaments';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Как в комнате: палитра фигур висит слева от доски (ей отведён отступ),
          а доска ограничена высотой экрана — вся страница видна без прокрутки. */}
      <div className="lg:landscape:pl-[8.75rem]">
        <div className="mx-auto w-[min(96vw,30rem)] lg:landscape:w-[min(100%,calc(100dvh-13rem),calc(100vw-36rem),42rem)]">
          <div className="relative z-10 w-full lg:landscape:aspect-square">
            <ChessBoard
              fen={fen}
              canMove={false}
              isEditing
              canEdit
              flipped={flipped}
              onEditFen={onEdit}
              compact
              fillContainer
              silent
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className={cn('flex flex-col gap-3 p-3', SURFACE)}>
          <div>
            <FieldLabel>Кто начинает</FieldLabel>
            <Segmented<'w' | 'b'>
              value={sideToMove(fen)}
              onChange={(side) => setFen(setSideToMove(fen, side))}
              ariaLabel="Кто делает первый ход"
              options={[
                { id: 'w', label: 'Белые' },
                { id: 'b', label: 'Чёрные' },
              ]}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <ToolButton icon={ArrowsClockwise} onClick={() => setFen(STARTING_FEN)}>
              Начальная позиция
            </ToolButton>
            <ToolButton icon={Eraser} onClick={() => setFen(emptyFen())}>
              Очистить доску
            </ToolButton>
            <ToolButton icon={ArrowsDownUp} onClick={() => setFlipped((v) => !v)}>
              Перевернуть
            </ToolButton>
          </div>
        </div>

        <div className={cn('flex flex-col gap-2 p-3', SURFACE)}>
          <FieldLabel>FEN этой позиции</FieldLabel>
          <textarea
            value={fen}
            onChange={(e) => setFen(e.target.value)}
            rows={3}
            spellCheck={false}
            aria-label="FEN позиции"
            className="input resize-none py-2 font-mono text-[12px] leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <ToolButton icon={copied ? Check : Copy} tone={copied ? 'primary' : 'neutral'} onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать FEN'}
            </ToolButton>
          </div>

          {check.error ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-red-50 px-2.5 py-2 text-[12.5px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <Warning size={14} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              {check.error}
            </p>
          ) : (
            <p className="text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
              {isStandard
                ? 'Это обычная начальная позиция. Турнир с ней можно создать и без FEN — поле в форме просто оставьте пустым.'
                : 'Позиция подходит для турнира. Скопируйте FEN и вставьте его в поле «Начальная позиция» при создании турнира.'}
            </p>
          )}

          <Link
            href={createHref}
            aria-disabled={check.error !== null}
            className={cn(
              'btn-primary mt-1 justify-center px-3.5 py-2 text-center text-[13px]',
              check.error !== null && 'pointer-events-none opacity-50',
            )}
          >
            <Trophy size={15} weight="bold" aria-hidden />
            Создать турнир с этой позиции
          </Link>
        </div>

        <p className="px-1 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
          Первый ход может быть и за чёрными — это выбирается выше и запоминается в самом
          FEN. В турнире со своей позицией партию не отменяют за долгий первый ход: думать
          над незнакомой расстановкой можно сколько нужно, но часы того, чей ход, идут
          с начала партии.
        </p>
      </div>
    </div>
  );
}
