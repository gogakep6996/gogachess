'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import {
  ArrowCounterClockwise,
  CaretDown,
  CheckCircle,
  CloudArrowUp,
  Eraser,
  FloppyDisk,
  NotePencil,
  Warning,
  X,
} from '@phosphor-icons/react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { SectionHead, SURFACE } from '@/components/class/ui';
import { FieldLabel, StatusChip, ToolButton } from '@/components/room/ui';
import { STARTING_FEN } from '@/lib/socket-events';
import { setSideToMove, sideToMove as fenSideToMove } from '@/lib/fen';
import { cn } from '@/lib/utils';
import type { TaskDto } from './TasksLibrary';

interface Props {
  task: TaskDto | null;
  onCancel: () => void;
  onSave: (task: TaskDto) => void;
}

/** Общий вид полей ввода редактора. */
const FIELD =
  'w-full rounded-xl border-0 bg-stone-900/[0.05] px-2.5 text-[13px] text-stone-800 outline-none ' +
  'ring-1 ring-inset ring-transparent transition placeholder:text-stone-400 ' +
  'focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800';

export function TaskEditor({ task, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [fen, setFen] = useState(task?.fen ?? STARTING_FEN);
  // sideToPlay — за кого играет ученик, и одновременно «чей ход» в FEN:
  // держим эти два значения синхронными, любая смена правит parts[1].
  const initialSide: 'w' | 'b' = (task?.sideToPlay as 'w' | 'b') ?? 'w';
  const [sideToPlay, setSideToPlay] = useState<'w' | 'b'>(initialSide);
  const [difficulty, setDifficulty] = useState(task?.difficulty ?? 'medium');
  const [category, setCategory] = useState(task?.category ?? '');
  const [goal, setGoal] = useState(task?.goal ?? 'mate');
  const [engineLevel, setEngineLevel] = useState(task?.engineLevel ?? 10);
  // Новая позиция по умолчанию идёт в библиотеку черновиком — учитель потом
  // опубликует её одной кнопкой.
  const [isPublished, setIsPublished] = useState(task?.isPublished ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pgnText, setPgnText] = useState('');
  const [pgnError, setPgnError] = useState<string | null>(null);

  const fenValid = useMemo(() => {
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }, [fen]);

  // Перетаскивание фигур меняет FEN — подтягиваем «чей ход» обратно в состояние.
  function handleEditFen(nextFen: string) {
    setFen(nextFen);
    const s = fenSideToMove(nextFen);
    if (s === 'w' || s === 'b') setSideToPlay(s);
  }

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

  // Разбираем PGN и ставим в редактор КОНЕЧНУЮ позицию партии.
  // Поддерживается обычный PGN (1. e4 e5 …), в том числе с заголовком [FEN "…"].
  function applyPgn() {
    const text = pgnText.trim();
    if (!text) {
      setPgnError('Вставьте PGN');
      return;
    }
    try {
      const game = new Chess();
      game.loadPgn(text);
      const nextFen = game.fen();
      setFen(nextFen);
      const s = fenSideToMove(nextFen);
      if (s === 'w' || s === 'b') setSideToPlay(s);
      setPgnError(null);
    } catch {
      setPgnError('Не удалось разобрать PGN — проверьте запись ходов');
    }
  }

  async function save() {
    if (!title.trim()) {
      setError('Введите название задачи');
      return;
    }
    if (!fenValid) {
      setError('Позиция не по правилам — исправьте расстановку');
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
    <div className="flex flex-col gap-3">
      <SectionHead
        title={task ? 'Редактирование позиции' : 'Новая позиция'}
        hint="Расставьте фигуры перетаскиванием, задайте условия и сохраните."
      >
        <ToolButton icon={X} size="md" onClick={onCancel}>
          Отмена
        </ToolButton>
        <ToolButton
          icon={isPublished ? CloudArrowUp : FloppyDisk}
          tone="primary"
          size="md"
          disabled={saving}
          onClick={save}
        >
          {saving
            ? 'Сохраняем…'
            : task
              ? 'Сохранить'
              : isPublished
                ? 'Создать и опубликовать'
                : 'Сохранить в библиотеку'}
        </ToolButton>
      </SectionHead>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* ── Доска-редактор ── */}
        <div className={cn('flex flex-col gap-2.5 p-2.5', SURFACE)}>
          <ChessBoard
            fen={fen}
            canMove={false}
            isEditing
            canEdit
            flipped={sideToPlay === 'b'}
            onEditFen={handleEditFen}
          />

          <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
            Перетащите фигуру из палитры на клетку. Чтобы убрать — вытащите её за пределы доски.
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToolButton icon={ArrowCounterClockwise} onClick={resetToStarting}>
              Стартовая
            </ToolButton>
            <ToolButton icon={Eraser} onClick={clearBoard}>
              Очистить
            </ToolButton>
            <span className="ml-auto">
              {fenValid ? (
                <StatusChip tone="brand">
                  <CheckCircle size={11} weight="fill" aria-hidden />
                  позиция верна
                </StatusChip>
              ) : (
                <StatusChip tone="red">
                  <Warning size={11} weight="fill" aria-hidden />
                  вне правил
                </StatusChip>
              )}
            </span>
          </div>

          <div className="border-t border-stone-900/[0.06] pt-2 dark:border-white/[0.07]">
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              aria-expanded={importOpen}
              className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-stone-500 transition-colors duration-150 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:text-stone-400 dark:hover:text-stone-100"
            >
              <CaretDown
                size={12}
                weight="bold"
                aria-hidden
                className={cn('transition-transform duration-150', importOpen && 'rotate-180')}
              />
              Ввести FEN или загрузить PGN
            </button>

            {importOpen && (
              <div className="mt-2 space-y-2.5">
                <label className="block">
                  <FieldLabel>FEN</FieldLabel>
                  <textarea
                    value={fen}
                    onChange={(e) => handleEditFen(e.target.value)}
                    rows={2}
                    spellCheck={false}
                    className={cn(FIELD, 'resize-none py-1.5 font-mono text-[11px]')}
                  />
                </label>
                <label className="block">
                  <FieldLabel>PGN — возьмём позицию после последнего хода</FieldLabel>
                  <textarea
                    value={pgnText}
                    onChange={(e) => setPgnText(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 …'}
                    className={cn(FIELD, 'resize-none py-1.5 font-mono text-[11px]')}
                  />
                </label>
                <ToolButton icon={NotePencil} onClick={applyPgn}>
                  Загрузить позицию из PGN
                </ToolButton>
                {pgnError && (
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    <Warning size={12} weight="bold" aria-hidden />
                    {pgnError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Условия задачи ── */}
        <div className={cn('flex flex-col gap-3 p-3', SURFACE)}>
          <label className="block">
            <FieldLabel>Название</FieldLabel>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Например: мат слоном и конём"
              className={cn(FIELD, 'h-9')}
            />
          </label>

          <label className="block">
            <FieldLabel>Описание (необязательно)</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Что должен сделать ученик и на что обратить внимание"
              className={cn(FIELD, 'resize-none py-2')}
            />
          </label>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <FieldLabel>Ученик играет за</FieldLabel>
              <select
                value={sideToPlay}
                onChange={(e) => changeSide(e.target.value as 'w' | 'b')}
                className={cn(FIELD, 'h-9')}
              >
                <option value="w">Белых</option>
                <option value="b">Чёрных</option>
              </select>
            </label>
            <label className="block">
              <FieldLabel>Сложность</FieldLabel>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className={cn(FIELD, 'h-9')}
              >
                <option value="easy">Легко</option>
                <option value="medium">Средне</option>
                <option value="hard">Сложно</option>
              </select>
            </label>
            <label className="block">
              <FieldLabel>Цель</FieldLabel>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className={cn(FIELD, 'h-9')}
              >
                <option value="mate">Поставить мат</option>
                <option value="win-material">Выиграть материал</option>
                <option value="custom">Свободная цель</option>
              </select>
            </label>
            <label className="block">
              <FieldLabel>Сила движка</FieldLabel>
              <input
                type="number"
                min={0}
                max={20}
                value={engineLevel}
                onChange={(e) => setEngineLevel(Number(e.target.value))}
                className={cn(FIELD, 'h-9 tabular-nums')}
              />
            </label>
          </div>

          <label className="block">
            <FieldLabel>Категория</FieldLabel>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={40}
              placeholder="эндшпиль, тактика, мат в 2"
              className={cn(FIELD, 'h-9')}
            />
          </label>

          <div className="rounded-xl bg-stone-900/[0.04] p-2.5 dark:bg-white/[0.05]">
            <FieldLabel>После сохранения</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton
                icon={NotePencil}
                active={!isPublished}
                onClick={() => setIsPublished(false)}
              >
                Оставить черновиком
              </ToolButton>
              <ToolButton
                icon={CloudArrowUp}
                active={isPublished}
                onClick={() => setIsPublished(true)}
              >
                Опубликовать ученикам
              </ToolButton>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              {isPublished
                ? 'Позицию можно будет раздать классу на уроке и добавить в домашние задания.'
                : 'Позицию увидите только вы. Опубликовать можно позже одной кнопкой.'}
            </p>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
              <Warning size={14} weight="bold" aria-hidden />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
