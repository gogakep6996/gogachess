'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { PromotionDialog } from '@/components/chess/PromotionDialog';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useStockfish } from '@/hooks/useStockfish';
import { STARTING_FEN } from '@/lib/socket-events';

interface Props {
  roomCode: string;
  meId: string;
  /** Это «личная доска ученика для задачи»: включён движок, человеку фиксирован цвет. */
  variant: 'task' | 'demo';
  /** Для variant='task' — цвет, за который играет человек. Двигатель играет противоположной. */
  humanColor?: 'w' | 'b';
  /** Сила движка 0–20. По умолчанию 10. */
  engineSkill?: number;
  /** Метка над доской (например название задачи). */
  caption?: string;
  /** Колбэк «выйти» (вернуться к сетке у учителя; покинуть демо у ученика и т.д.). */
  onExit?: () => void;
  /** Подпись правой кнопки выхода. */
  exitLabel?: string;
}

export function LessonBoard({
  roomCode,
  meId,
  variant,
  humanColor,
  engineSkill = 10,
  caption,
  onExit,
  exitLabel = 'Закрыть',
}: Props) {
  const room = useRoomSocket(roomCode);
  const engine = useStockfish();
  const { state, connected, sendMove, resetToInitial, undoMove } = room;
  const isOwner = state?.ownerId === meId;
  // Движок крутится у того, чья доска: у ученика (он играет вс. движок).
  // У учителя при вторжении (он = owner на student-board) движок выключен —
  // учитель сам управляет демонстрацией обоих цветов.
  const engineEnabled = variant === 'task' && Boolean(humanColor) && !isOwner;

  // Промоушн пешки.
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null);

  const fen = state?.fen ?? STARTING_FEN;
  // Перевёрнутая ориентация — для ученика, играющего за чёрных. Учитель смотрит как «белые внизу».
  const flipped = humanColor === 'b' && !isOwner;

  // Engine: настройка силы.
  useEffect(() => {
    if (engineEnabled && engine.ready) engine.setSkill(engineSkill);
  }, [engineEnabled, engine.ready, engineSkill, engine]);

  // Engine: запуск анализа когда ход НЕ человека.
  const lastFenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!engineEnabled || !humanColor) return;
    if (state?.isEditing) return;
    if (!engine.ready || engine.thinking) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === humanColor) return;
    if (lastFenRef.current === fen) return;
    lastFenRef.current = fen;
    engine.analyse(fen, { movetime: 700 });
  }, [engineEnabled, humanColor, fen, state?.isEditing, engine.ready, engine.thinking, engine]);

  // Engine: получили bestmove — отправляем как ход движка.
  useEffect(() => {
    if (!engineEnabled || !humanColor) return;
    const m = engine.evaluation.bestmove;
    if (!m || m.length < 4) return;
    if (lastFenRef.current !== fen) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === humanColor) return;
    sendMove({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.evaluation.bestmove]);

  const choosePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromotion) return;
      sendMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
      setPendingPromotion(null);
    },
    [pendingPromotion, sendMove],
  );

  if (!connected || !state) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-stone-500">
        Подключаемся к доске…
      </div>
    );
  }

  // Подсветка последнего хода.
  const lastMove = state.history.length > 0 ? state.history[state.history.length - 1] : null;
  const highlights = lastMove ? { from: lastMove.from, to: lastMove.to } : undefined;

  // Кто может ходить?
  // variant='task': ученик ходит только своим цветом (sideLock=humanColor).
  // variant='demo': все могут двигать (учитель + ученики), полная свобода.
  const sideLockForBoard: 'w' | 'b' | null =
    variant === 'task' && humanColor ? humanColor : null;
  // Однако если учитель (owner) сейчас вмешался в student-board — он должен двигать любыми.
  const effectiveSideLock = isOwner ? null : sideLockForBoard;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex flex-col items-center gap-2">
        {caption && (
          <div className="flex w-full items-center justify-between text-sm">
            <span className="font-semibold">{caption}</span>
            {onExit && (
              <button onClick={onExit} className="btn-ghost text-xs">
                {exitLabel}
              </button>
            )}
          </div>
        )}
        <div className="mx-auto" style={{ width: 'min(94vw, 480px)', maxWidth: '100%' }}>
          <ChessBoard
            fen={fen}
            canMove={!state.isEditing && connected}
            isEditing={state.isEditing && isOwner}
            canEdit={isOwner}
            flipped={flipped}
            allowIllegal={state.mode.allowIllegal}
            sideLock={effectiveSideLock}
            canStartAnySide={!effectiveSideLock && state.freshSegment}
            highlights={highlights}
            onMove={sendMove}
            onPromotionRequest={(m) => {
              setPendingPromotion(m);
              return true;
            }}
            onEditFen={isOwner ? (f) => room.updateEdit(f) : undefined}
            compact
            fillContainer
          />
        </div>

        <div className="flex w-full justify-center gap-2">
          <button
            onClick={() => undoMove()}
            disabled={state.history.length === 0 || state.isEditing}
            className="btn-outline text-xs"
          >
            ← Отменить ход
          </button>
          {isOwner && (
            <button onClick={() => resetToInitial()} className="btn-outline text-xs">
              ⟲ Начальная позиция
            </button>
          )}
        </div>
      </div>

      {/* Боковая панель: история, режимы для учителя, статус движка */}
      <aside className="flex flex-col gap-2">
        {engineEnabled && (
          <div className="card text-xs">
            <div className="font-semibold">Соперник: движок</div>
            <div className="mt-1 text-stone-500">
              {engine.thinking ? 'Думает…' : engine.ready ? 'Готов' : 'Загружается'}
            </div>
          </div>
        )}

        {isOwner && variant === 'task' && (
          <TeacherTools room={room} />
        )}

        <div className="card flex-1 overflow-hidden">
          <div className="mb-1 text-xs font-semibold uppercase text-stone-500">История</div>
          <ol className="max-h-72 space-y-0.5 overflow-y-auto text-xs font-mono">
            {state.history.length === 0 ? (
              <li className="text-stone-500">— нет ходов —</li>
            ) : (
              state.history.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-6 text-stone-500">{Math.floor(i / 2) + 1}.</span>
                  <span>{h.san}</span>
                </li>
              ))
            )}
          </ol>
        </div>
      </aside>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={choosePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}

function TeacherTools({ room }: { room: ReturnType<typeof useRoomSocket> }) {
  const { state, startEdit, endEdit, setMode } = room;
  if (!state) return null;
  return (
    <div className="card text-xs">
      <div className="mb-1 font-semibold">Учитель: вмешательство</div>
      {state.isEditing ? (
        <button
          onClick={() => endEdit(state.fen)}
          className="btn-primary mb-2 w-full text-xs"
        >
          Сохранить позицию
        </button>
      ) : (
        <button
          onClick={() => startEdit()}
          className="btn-outline mb-2 w-full text-xs"
        >
          ✎ Редактировать
        </button>
      )}
      <div className="space-y-1">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.mode.allowIllegal}
            onChange={(e) => setMode({ allowIllegal: e.target.checked })}
          />
          <span>Любые ходы</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-stone-500">Кто ходит:</span>
          {(['w', 'b', null] as const).map((s) => (
            <button
              key={String(s)}
              onClick={() => setMode({ sideLock: s })}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                state.mode.sideLock === s
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-stone-300 dark:border-stone-700'
              }`}
            >
              {s === 'w' ? 'Белые' : s === 'b' ? 'Чёрные' : 'Оба'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
