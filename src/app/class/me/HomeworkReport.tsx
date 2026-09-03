'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CaretRight, Check, X } from '@phosphor-icons/react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { MoveNav } from '@/components/chess/MoveNav';
import { FieldLabel, IconButton, StatusChip } from '@/components/room/ui';
import { STARTING_FEN, type MoveHistoryEntry } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import type { TaskDto } from './TasksLibrary';

interface ReportRow {
  userId: string;
  name: string;
  attempts: number;
  solves: number;
  lastAttemptAt: string | null;
  lastSolvedAt: string | null;
}

interface ReportData {
  task: { id: string; title: string };
  totals: { students: number; attempts: number; solvedStudents: number };
  rows: ReportRow[];
}

interface AttemptRow {
  id: string;
  index: number;
  status: string;
  movesPlayed: number;
  startedAt: string;
  solvedAt: string | null;
  startFen: string;
  moves: MoveHistoryEntry[];
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HomeworkReport({ task, onClose }: { task: TaskDto; onClose: () => void }) {
  const flipped = task.sideToPlay === 'b';

  // Навигация: список учеников → попытки одного ученика (доска + ходы).
  const [student, setStudent] = useState<{ userId: string; name: string } | null>(null);

  // ── Уровень 1: сводка по ученикам ──
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      setReportError(null);
      try {
        const res = await fetch(`/api/class/me/tasks/${task.id}/report`, { cache: 'no-store' });
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as ReportData;
        if (!cancelled) setReport(json);
      } catch {
        if (!cancelled) setReportError('Не удалось загрузить отчёт');
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // Закрытие по Escape: модалка перекрывает всю страницу, из неё нужен выход
  // без мыши.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Уровень 2: попытки выбранного ученика ──
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const openStudent = useCallback(
    async (row: { userId: string; name: string }) => {
      setStudent(row);
      setAttempts([]);
      setAttemptsLoading(true);
      setAttemptsError(null);
      try {
        const res = await fetch(
          `/api/class/me/tasks/${task.id}/attempts?userId=${encodeURIComponent(row.userId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as { attempts: AttemptRow[] };
        setAttempts(json.attempts);
      } catch {
        setAttemptsError('Не удалось загрузить попытки');
      } finally {
        setAttemptsLoading(false);
      }
    },
    [task.id],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Отчёт по заданию: ${task.title}`}
    >
      <div
        className={cn(
          'flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-stone-900/10 dark:bg-stone-900 dark:ring-white/10',
          student ? 'max-w-3xl' : 'max-w-2xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-stone-900/[0.07] px-3 py-2.5 dark:border-white/[0.08]">
          {student && (
            <IconButton
              icon={ArrowLeft}
              label="Назад к списку учеников"
              onClick={() => setStudent(null)}
            />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[11px] font-medium text-stone-500 dark:text-stone-400">
              {student ? task.title : 'Отчёт по заданию'}
            </div>
            <h3 className="truncate text-[14px] font-semibold text-stone-800 dark:text-stone-100">
              {student ? student.name : task.title}
            </h3>
          </div>
          <IconButton icon={X} label="Закрыть отчёт" onClick={onClose} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {student ? (
            attemptsLoading ? (
              <Message>Загружаем попытки…</Message>
            ) : attemptsError ? (
              <Message tone="error">{attemptsError}</Message>
            ) : attempts.length === 0 ? (
              <Message>У ученика ещё нет попыток.</Message>
            ) : (
              <StudentReplayView attempts={attempts} flipped={flipped} />
            )
          ) : (
            <StudentsTable
              loading={reportLoading}
              error={reportError}
              data={report}
              onOpen={openStudent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Message({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'error';
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'py-10 text-center text-[13px]',
        tone === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-stone-500 dark:text-stone-400',
      )}
    >
      {children}
    </p>
  );
}

/** Доска слева, попытки и ходы справа. */
function StudentReplayView({ attempts, flipped }: { attempts: AttemptRow[]; flipped: boolean }) {
  const [selId, setSelId] = useState<string>(attempts[0]?.id ?? '');
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  const selected = useMemo(
    () => attempts.find((a) => a.id === selId) ?? attempts[0],
    [attempts, selId],
  );

  // При переключении попытки возвращаемся к финальной позиции.
  useEffect(() => {
    setViewIdx(null);
  }, [selId]);

  const moves = selected?.moves ?? [];
  const start = selected?.startFen || STARTING_FEN;
  const viewedFen = useMemo(() => {
    if (moves.length === 0) return start;
    if (viewIdx === null) return moves[moves.length - 1].fen;
    if (viewIdx === -1) return start;
    return moves[viewIdx]?.fen ?? start;
  }, [viewIdx, moves, start]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="overflow-hidden rounded-xl ring-1 ring-stone-900/10 dark:ring-white/10">
        <MiniBoard fen={viewedFen} size={300} flipped={flipped} />
      </div>

      <div className="flex w-full flex-col gap-2.5 sm:w-64">
        <div>
          <FieldLabel>Попытка</FieldLabel>
          <div className="flex flex-wrap gap-1">
            {attempts.map((a) => {
              const active = a.id === selId;
              const solved = a.status === 'solved';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelId(a.id)}
                  title={`Попытка ${a.index}${solved ? ' — решено' : ''}`}
                  className={cn(
                    'flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-lg px-2 text-[13px] font-semibold tabular-nums transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
                    active
                      ? 'bg-brand-600 text-white'
                      : solved
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                        : 'bg-stone-900/[0.05] text-stone-600 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]',
                  )}
                >
                  {a.index}
                  {solved && <Check size={11} weight="bold" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
            {selected.status === 'solved' ? (
              <StatusChip tone="brand">
                <Check size={11} weight="bold" aria-hidden />
                решено
              </StatusChip>
            ) : (
              <StatusChip tone="neutral">не решено</StatusChip>
            )}
            <span className="tabular-nums">{moves.length} ходов</span>
            <span className="tabular-nums">{fmt(selected.startedAt)}</span>
          </div>
        )}

        {moves.length === 0 ? (
          <p className="rounded-xl bg-stone-900/[0.04] px-3 py-2 text-[12px] text-stone-500 dark:bg-white/[0.05] dark:text-stone-400">
            В этой попытке нет ходов.
          </p>
        ) : (
          <MoveNav history={moves} viewIdx={viewIdx} onSelect={setViewIdx} />
        )}
      </div>
    </div>
  );
}

function StudentsTable({
  loading,
  error,
  data,
  onOpen,
}: {
  loading: boolean;
  error: string | null;
  data: ReportData | null;
  onOpen: (row: { userId: string; name: string }) => void;
}) {
  if (loading) return <Message>Загружаем отчёт…</Message>;
  if (error) return <Message tone="error">{error}</Message>;
  if (!data || data.rows.length === 0) {
    return <Message>Задание ещё никто не решал.</Message>;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-stone-500 dark:text-stone-400">
        <span className="tabular-nums">
          решало{' '}
          <span className="font-semibold text-stone-700 dark:text-stone-200">
            {data.totals.students}
          </span>
        </span>
        <span className="tabular-nums">
          решили{' '}
          <span className="font-semibold text-stone-700 dark:text-stone-200">
            {data.totals.solvedStudents}
          </span>
        </span>
        <span className="tabular-nums">
          попыток{' '}
          <span className="font-semibold text-stone-700 dark:text-stone-200">
            {data.totals.attempts}
          </span>
        </span>
      </div>

      <ul className="space-y-1">
        {data.rows.map((r) => (
          <li key={r.userId}>
            <button
              type="button"
              onClick={() => onOpen({ userId: r.userId, name: r.name })}
              className="flex w-full items-center gap-2.5 rounded-xl bg-stone-900/[0.03] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-stone-900/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            >
              <span
                aria-hidden
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[12px] font-bold text-white',
                  r.solves > 0 ? 'bg-brand-600' : 'bg-stone-400 dark:bg-stone-600',
                )}
              >
                {r.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">
                  {r.name}
                </span>
                <span className="block truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
                  попыток: {r.attempts} · последнее решение: {fmt(r.lastSolvedAt)}
                </span>
              </span>
              {r.solves > 0 && (
                <StatusChip tone="brand">
                  <Check size={11} weight="bold" aria-hidden />
                  {r.solves}
                </StatusChip>
              )}
              <CaretRight
                size={14}
                weight="bold"
                aria-hidden
                className="shrink-0 text-stone-300 dark:text-stone-600"
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
