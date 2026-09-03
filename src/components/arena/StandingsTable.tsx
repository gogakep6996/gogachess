'use client';

// Таблица арены. Порядок считает сервер, здесь только показ.
//
// Строки идут с ключом по userId: при обновлении React переставляет готовые
// строки вместо того, чтобы перерисовать таблицу целиком, поэтому список
// не мигает, а доска рядом не дёргается.

import { useEffect, useRef, useState } from 'react';
import { Fire, Pause, Play } from '@phosphor-icons/react';

import type { ArenaResult, ArenaStandingDto } from '@/lib/socket-events';
import { ARENA_POINTS } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

/** Цветной квадратик одного результата. */
function ResultSquare({ result }: { result: ArenaResult }) {
  const skin = {
    win: 'bg-brand-500',
    draw: 'bg-stone-300 dark:bg-stone-600',
    loss: 'bg-red-400/80 dark:bg-red-500/70',
  }[result];
  const label = { win: 'победа', draw: 'ничья', loss: 'поражение' }[result];
  return (
    <span
      title={label}
      aria-label={label}
      className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', skin)}
    />
  );
}

/** Огонёк серии: со второй победы подряд очки удваиваются. */
function StreakFlame({ streak }: { streak: number }) {
  if (streak < ARENA_POINTS.streakFrom) return null;
  return (
    <span
      title={`${streak} победы подряд: следующая победа даст ${ARENA_POINTS.winOnStreak} очка`}
      className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
    >
      <Fire size={13} weight="fill" aria-hidden />
      <span className="text-[11px] font-semibold tabular-nums">{streak}</span>
    </span>
  );
}

function Row({
  row,
  isMe,
  showRank = true,
  showPause = true,
  rowRef,
}: {
  row: ArenaStandingDto;
  isMe: boolean;
  showRank?: boolean;
  /** В законченном турнире пауза уже ничего не значит — значок лишний. */
  showPause?: boolean;
  rowRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={rowRef}
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5',
        isMe && 'bg-brand-50/80 dark:bg-brand-900/50',
      )}
    >
      {showRank && (
        <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
          {row.rank}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            'truncate text-[13px]',
            isMe
              ? 'font-semibold text-brand-800 dark:text-brand-100'
              : 'font-medium text-stone-800 dark:text-stone-100',
          )}
        >
          {row.name}
        </span>
        {showPause && row.state === 'paused' && (
          <span title="На паузе: пары не получает" className="shrink-0 leading-none">
            <Pause
              size={12}
              weight="fill"
              aria-label="на паузе"
              className="text-stone-400 dark:text-stone-500"
            />
          </span>
        )}
        {showPause && row.state === 'playing' && (
          <span title="Сейчас играет партию" className="shrink-0 leading-none">
            <Play
              size={12}
              weight="fill"
              aria-label="играет"
              className="text-brand-500 dark:text-brand-400"
            />
          </span>
        )}
        <StreakFlame streak={row.streak} />
      </span>
      <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
        {row.recent.map((r, i) => (
          <ResultSquare key={i} result={r} />
        ))}
      </span>
      <span className="w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums text-stone-800 dark:text-stone-100">
        {row.score}
      </span>
    </div>
  );
}

export function StandingsTable({
  standings,
  meId,
  finished = false,
}: {
  standings: ArenaStandingDto[];
  meId: string | null;
  finished?: boolean;
}) {
  const mine = meId ? standings.find((s) => s.userId === meId) ?? null : null;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [myRow, setMyRow] = useState<HTMLDivElement | null>(null);
  const [myRowVisible, setMyRowVisible] = useState(true);

  // Своя строка закрепляется сверху только когда она уехала из видимой части
  // списка. Иначе на втором месте человек видел бы себя дважды.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !myRow) {
      setMyRowVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setMyRowVisible(entry.isIntersecting),
      { root, threshold: 0.6 },
    );
    observer.observe(myRow);
    return () => observer.disconnect();
  }, [myRow]);

  return (
    <div className="flex min-h-0 flex-col">
      {mine && !myRowVisible && (
        <div className="shrink-0 border-b border-stone-900/[0.06] dark:border-white/[0.06]">
          <div className="px-2.5 pt-2 text-[11px] font-medium text-stone-500 dark:text-stone-400">
            Вы на {mine.rank} месте
          </div>
          <Row row={mine} isMe showPause={!finished} />
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {standings.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-[12px] text-stone-400 dark:text-stone-500">
            Пока никто не записался
          </p>
        ) : (
          <div className="divide-y divide-stone-900/[0.05] dark:divide-white/[0.05]">
            {standings.map((row) => {
              const isMe = row.userId === meId;
              return (
                <Row
                  key={row.userId}
                  row={row}
                  isMe={isMe}
                  showPause={!finished}
                  rowRef={isMe ? setMyRow : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
