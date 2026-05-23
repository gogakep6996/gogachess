'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { STARTING_FEN } from '@/lib/socket-events';
import { setSideToMove, sideToMove as fenSideToMove } from '@/lib/fen';
import type { TaskDto } from './TasksLibrary';

interface Props {
  task: TaskDto | null;
  onCancel: () => void;
  onSave: (task: TaskDto) => void;
}

export function TaskEditor({ task, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [fen, setFen] = useState(task?.fen ?? STARTING_FEN);
  // sideToPlay — это то, ЗА КОГО играет ученик. И одновременно «чей ход» в FEN —
  // мы синхронизируем эти два значения. Любая смена обновляет parts[1] в FEN.
  const initialSide: 'w' | 'b' = (task?.sideToPlay as 'w' | 'b') ?? 'w';
  const [sideToPlay, setSideToPlay] = useState<'w' | 'b'>(initialSide);
  const [difficulty, setDifficulty] = useState(task?.difficulty ?? 'medium');
  const [category, setCategory] = useState(task?.category ?? '');
  const [goal, setGoal] = useState(task?.goal ?? 'mate');
  const [engineLevel, setEngineLevel] = useState(task?.engineLevel ?? 10);
  // Новая позиция по умолчанию идёт в библиотеку как черновик —
  // учитель потом одной кнопкой опубликует её для учеников.
  const [isPublished, setIsPublished] = useState(task?.isPublished ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFenField, setShowFenField] = useState(false);

  const fenValid = useMemo(() => {
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }, [fen]);

  // Меняется ли FEN при перетаскивании фигур — синхронизируем «чей ход»
  // из FEN в наш sideToPlay (на случай, если редактор сам поменял парта 2).
  function handleEditFen(nextFen: string) {
    setFen(nextFen);
    const s = fenSideToMove(nextFen);
    if (s === 'w' || s === 'b') setSideToPlay(s);
  }

  // Переключатель «За кого играет ученик» (= чей ход) — правим FEN.
  function changeSide(s: 'w' | 'b') {
    setSideToPlay(s);
    setFen((prev) => setSideToMove(prev, s));
  }

  function clearBoard() {
    setFen(`8/8/8/8/8/8/8/8 ${sideToPlay} - - 0 1`);
  }

  function resetToStarting() {
    setFen(STARTING_FEN);
    setSideToPlay('w');
  }

  async function save() {
    if (!title.trim()) {
      setError('Введите название задачи');
      return;
    }
    if (!fenValid) {
      setError('FEN-позиция некорректна (chess.js не принимает)');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const url = task ? `/api/class/me/tasks/${task.id}` : '/api/class/me/tasks';
      const res = await fetch(url, {
        method: task ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          fen,
          sideToPlay,
          difficulty,
          category: category.trim() || null,
          goal,
          engineLevel,
          isPublished,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        setError(e.error || 'Не удалось сохранить');
        return;
      }
      const data = (await res.json()) as { task: TaskDto };
      onSave(data.task);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Левая колонка: интерактивная доска-редактор */}
      <div className="card flex flex-col items-center gap-3">
        <div className="w-full text-xs font-semibold text-stone-500">
          Расставьте позицию: возьмите фигуру из палитры и перетащите на клетку.
          Чтобы убрать — перетащите фигуру за пределы доски.
        </div>
        <div className="w-full" style={{ maxWidth: 420 }}>
          <ChessBoard
            fen={fen}
            canMove={false}
            isEditing
            canEdit
            flipped={sideToPlay === 'b'}
            onEditFen={handleEditFen}
            compact
            fillContainer
          />
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex gap-1.5">
            <button onClick={resetToStarting} className="btn-ghost text-xs">
              ↺ Стартовая
            </button>
            <button onClick={clearBoard} className="btn-ghost text-xs">
              ✕ Очистить
            </button>
          </div>
          <span className={fenValid ? 'text-stone-500' : 'text-red-600'}>
            {fenValid ? 'позиция валидна' : 'позиция вне правил'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowFenField((v) => !v)}
          className="self-start text-[11px] text-brand-600 hover:underline"
        >
          {showFenField ? 'Скрыть FEN' : 'Показать / вставить FEN вручную'}
        </button>
        {showFenField && (
          <textarea
            value={fen}
            onChange={(e) => handleEditFen(e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-stone-300 bg-white px-2 py-1 font-mono text-[11px] dark:border-stone-700 dark:bg-stone-900"
          />
        )}
      </div>

      {/* Правая колонка: метаданные задачи */}
      <div className="card grid gap-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">Название</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Например: Мат слоном и конём"
            className="w-full rounded border border-stone-300 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">
            Описание (необязательно)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Что должен сделать ученик и за что обращать внимание?"
            className="w-full resize-none rounded border border-stone-300 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Ученик играет за">
            <select
              value={sideToPlay}
              onChange={(e) => changeSide(e.target.value as 'w' | 'b')}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <option value="w">Белых</option>
              <option value="b">Чёрных</option>
            </select>
          </Field>
          <Field label="Сложность">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <option value="easy">Легко</option>
              <option value="medium">Средне</option>
              <option value="hard">Сложно</option>
            </select>
          </Field>
          <Field label="Цель">
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <option value="mate">Поставить мат</option>
              <option value="win-material">Выиграть материал</option>
              <option value="custom">Свободная цель</option>
            </select>
          </Field>
          <Field label="Сила движка">
            <input
              type="number"
              min={0}
              max={20}
              value={engineLevel}
              onChange={(e) => setEngineLevel(Number(e.target.value))}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
            />
          </Field>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">
            Категория (тэг)
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={40}
            placeholder="эндшпиль, тактика, мат в 2…"
            className="w-full rounded border border-stone-300 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800/40">
          <div className="mb-1 text-xs font-semibold text-stone-500">Что делать после сохранения</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsPublished(false)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                !isPublished
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-700'
              }`}
            >
              📝 В библиотеку (черновик)
            </button>
            <button
              type="button"
              onClick={() => setIsPublished(true)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                isPublished
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-700'
              }`}
            >
              🟢 Опубликовать ученикам
            </button>
          </div>
          <p className="mt-1 text-[11px] text-stone-500">
            {isPublished
              ? 'Эта позиция появится у учеников в каталоге класса.'
              : 'Позиция будет видна только вам — на вкладке «Черновики». Опубликовать сможете позже одним кликом.'}
          </p>
        </div>

        {error && <div className="text-xs text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving
              ? 'Сохраняю…'
              : task
                ? 'Сохранить изменения'
                : isPublished
                  ? 'Создать и опубликовать'
                  : 'Сохранить в библиотеку'}
          </button>
          <button onClick={onCancel} className="btn-ghost text-sm">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-500">{label}</label>
      {children}
    </div>
  );
}
