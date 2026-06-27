'use client';

// Перемотка ходов в турнирной партии.
// viewIdx === null — «следим за актуальной позицией»,
// в любой другой ситуации (число) — мы смотрим прошлый ход.
// Кнопки: |◀ старт, ◀ назад, ▶ вперёд, ▶| текущая.

import { useEffect, useRef } from 'react';
import type { MoveHistoryEntry } from '@/lib/socket-events';

interface Props {
  history: MoveHistoryEntry[];
  viewIdx: number | null;
  onSelect: (idx: number | null) => void;
}

export function MoveNav({ history, viewIdx, onSelect }: Props) {
  const lastIdx = history.length - 1;
  const effective = viewIdx ?? lastIdx;
  const listRef = useRef<HTMLDivElement | null>(null);

  // Если viewIdx меняется (или приходит новый ход) — прокручиваем список к активному.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const child = el.querySelector<HTMLElement>('[data-active="true"]');
    if (!child) return;
    const elRect = el.getBoundingClientRect();
    const cRect = child.getBoundingClientRect();
    if (cRect.top < elRect.top || cRect.bottom > elRect.bottom) {
      // ВАЖНО: scrollTop — а не scrollIntoView, иначе скроллится вся страница (баг,
      // который мы уже ловили в HistoryPanel у /room).
      el.scrollTop = child.offsetTop - el.clientHeight / 2 + child.clientHeight / 2;
    }
  }, [viewIdx, history.length]);

  const goStart = () => onSelect(history.length === 0 ? null : -1);
  const goPrev = () => {
    if (history.length === 0) return;
    const cur = viewIdx ?? lastIdx;
    if (cur <= -1) return;
    const next = cur - 1;
    onSelect(next < -1 ? -1 : next);
  };
  const goNext = () => {
    if (history.length === 0) return;
    const cur = viewIdx ?? lastIdx;
    if (cur >= lastIdx) return;
    const next = cur + 1;
    onSelect(next >= lastIdx ? null : next);
  };
  const goEnd = () => onSelect(null);

  // Группируем по парам (ход белых / ход чёрных).
  const rows: Array<{ moveNo: number; white?: MoveHistoryEntry; black?: MoveHistoryEntry; whiteIdx?: number; blackIdx?: number }> = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      moveNo: i / 2 + 1,
      white: history[i],
      whiteIdx: i,
      black: history[i + 1],
      blackIdx: i + 1 < history.length ? i + 1 : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <button
          className="btn-outline flex-1 px-2 py-1 text-xs"
          onClick={goStart}
          disabled={history.length === 0 || effective === -1}
          aria-label="К началу"
        >
          ◀◀
        </button>
        <button
          className="btn-outline flex-1 px-2 py-1 text-xs"
          onClick={goPrev}
          disabled={history.length === 0 || effective <= -1}
          aria-label="Назад"
        >
          ◀
        </button>
        <button
          className="btn-outline flex-1 px-2 py-1 text-xs"
          onClick={goNext}
          disabled={history.length === 0 || effective >= lastIdx}
          aria-label="Вперёд"
        >
          ▶
        </button>
        <button
          className="btn-outline flex-1 px-2 py-1 text-xs"
          onClick={goEnd}
          disabled={history.length === 0 || viewIdx === null}
          aria-label="К актуальной позиции"
        >
          ▶▶
        </button>
      </div>
      <div
        ref={listRef}
        className="h-[90px] overflow-y-auto rounded-lg border border-stone-200/70 bg-paper/70 p-1 text-sm dark:border-stone-800/70 dark:bg-stone-900/40"
      >
        {history.length === 0 ? (
          <div className="px-2 py-1 text-xs text-stone-500">Ходов пока нет</div>
        ) : (
          <table className="w-full">
            <tbody>
              {rows.map((row) => (
                <tr key={row.moveNo}>
                  <td className="w-8 px-1 text-right text-xs text-stone-500">{row.moveNo}.</td>
                  <td className="px-1">
                    {row.white && row.whiteIdx !== undefined ? (
                      <MoveCell
                        san={row.white.san}
                        active={effective === row.whiteIdx}
                        onClick={() =>
                          onSelect(row.whiteIdx === lastIdx ? null : (row.whiteIdx as number))
                        }
                      />
                    ) : null}
                  </td>
                  <td className="px-1">
                    {row.black && row.blackIdx !== undefined ? (
                      <MoveCell
                        san={row.black.san}
                        active={effective === row.blackIdx}
                        onClick={() =>
                          onSelect(row.blackIdx === lastIdx ? null : (row.blackIdx as number))
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MoveCell({ san, active, onClick }: { san: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className="w-full rounded px-1.5 py-0.5 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
    >
      {/* Активный ход — подчёркивание ровно под координатой, цветом самой координаты.
          inline-block, чтобы линия не растягивалась на всю ширину кнопки. */}
      <span
        className={
          active
            ? 'inline-block font-semibold underline decoration-current decoration-1 underline-offset-2'
            : 'inline-block'
        }
      >
        {san}
      </span>
    </button>
  );
}
