'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { MoveNav } from '@/components/tournament/MoveNav';
import { STARTING_FEN, type MoveHistoryEntry } from '@/lib/socket-events';
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

  // Навигация: список учеников → просмотр попыток ученика (доска + переключатель).
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-paper shadow-xl dark:border-stone-700 dark:bg-stone-900 ${
          student ? 'max-w-3xl' : 'max-w-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <div className="flex items-start gap-2">
            {student && (
              <button
                onClick={() => setStudent(null)}
                className="mt-0.5 rounded-md border border-stone-300 px-2 py-0.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                title="Назад к ученикам"
              >
                ←
              </button>
            )}
            <div>
              <div className="text-xs font-semibold uppercase text-stone-500">
                {student ? task.title : 'Отчёт по заданию'}
              </div>
              <h3 className="text-base font-semibold leading-tight">
                {student ? student.name : task.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-stone-300 px-2 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {student ? (
            attemptsLoading ? (
              <div className="py-8 text-center text-sm text-stone-500">Загрузка…</div>
            ) : attemptsError ? (
              <div className="py-8 text-center text-sm text-red-600">{attemptsError}</div>
            ) : attempts.length === 0 ? (
              <div className="py-8 text-center text-sm text-stone-500">
                У ученика ещё нет попыток.
              </div>
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

/** Доска слева + переключатель попыток и список ходов справа. */
function StudentReplayView({ attempts, flipped }: { attempts: AttemptRow[]; flipped: boolean }) {
  const [selId, setSelId] = useState<string>(attempts[0]?.id ?? '');
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  const selected = useMemo(
    () => attempts.find((a) => a.id === selId) ?? attempts[0],
    [attempts, selId],
  );

  // При переключении попытки — возвращаемся к финальной позиции.
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
      <MiniBoard fen={viewedFen} size={300} flipped={flipped} />

      <div className="flex w-full flex-col gap-2 sm:w-64">
        {/* Переключатель попыток */}
        <div className="flex flex-wrap gap-1">
          {attempts.map((a) => {
            const active = a.id === selId;
            const solved = a.status === 'solved';
            return (
              <button
                key={a.id}
                onClick={() => setSelId(a.id)}
                title={`Попытка ${a.index}${solved ? ' — решено' : ''}`}
                className={`flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-lg border px-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : solved
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'border-stone-300 bg-paper text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
                }`}
              >
                {a.index}
                {solved && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="text-xs text-stone-500">
            Попытка {selected.index} ·{' '}
            {selected.status === 'solved' ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">решено ✓</span>
            ) : (
              'не решено'
            )}{' '}
            · {moves.length} ходов · {fmt(selected.startedAt)}
          </div>
        )}

        {moves.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/40">
            В этой попытке нет ходов.
          </div>
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
  if (loading) return <div className="py-8 text-center text-sm text-stone-500">Загрузка…</div>;
  if (error) return <div className="py-8 text-center text-sm text-red-600">{error}</div>;
  if (!data || data.rows.length === 0) {
    return <div className="py-8 text-center text-sm text-stone-500">Задачу ещё никто не решал.</div>;
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Stat label="Учеников решало" value={data.totals.students} />
        <Stat label="Решили" value={data.totals.solvedStudents} />
        <Stat label="Всего попыток" value={data.totals.attempts} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500 dark:border-stone-700">
            <th className="py-2 pr-2 font-semibold">Ученик</th>
            <th className="py-2 px-2 text-center font-semibold">Попыток</th>
            <th className="py-2 px-2 text-center font-semibold">Решил</th>
            <th className="py-2 pl-2 font-semibold">Последнее решение</th>
            <th className="py-2 pl-2" />
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr
              key={r.userId}
              className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/40"
              onClick={() => onOpen({ userId: r.userId, name: r.name })}
            >
              <td className="py-2 pr-2 font-medium">{r.name}</td>
              <td className="py-2 px-2 text-center tabular-nums">{r.attempts}</td>
              <td className="py-2 px-2 text-center tabular-nums">
                {r.solves > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    ✓ {r.solves}
                  </span>
                ) : (
                  <span className="text-stone-400">0</span>
                )}
              </td>
              <td className="py-2 pl-2 tabular-nums text-stone-500">{fmt(r.lastSolvedAt)}</td>
              <td className="py-2 pl-2 text-right text-xs font-semibold text-brand-600 dark:text-brand-300">
                Смотреть →
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-stone-100 px-3 py-1.5 dark:bg-stone-800">
      <span className="font-semibold tabular-nums">{value}</span>{' '}
      <span className="text-stone-500">{label}</span>
    </div>
  );
}
