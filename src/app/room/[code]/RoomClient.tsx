'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { PromotionDialog } from '@/components/chess/PromotionDialog';
import { ChatPanel } from '@/components/room/ChatPanel';
import { AudioPanel } from '@/components/room/AudioPanel';
import { EnginePanel } from '@/components/room/EnginePanel';
import { HistoryPanel } from '@/components/room/HistoryPanel';
import { ModePanel } from '@/components/room/ModePanel';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { useStockfish } from '@/hooks/useStockfish';
import { DEFAULT_ROOM_MODE, STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface Props {
  meId: string;
  meName: string;
  room: {
    code: string;
    name: string;
    isPublic: boolean;
    ownerId: string;
    ownerName: string;
  };
}

export function RoomClient({ meId, room }: Props) {
  const isOwner = meId === room.ownerId;

  // Блокируем скролл документа ТОЛЬКО на десктопе — там layout вписывается в один экран.
  // На телефоне страница должна свободно скроллиться, иначе доска перекрывается панелями.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOB = html.style.overscrollBehavior;
    const prevBodyOB = body.style.overscrollBehavior;
    let active = false;

    function apply() {
      if (mq.matches && !active) {
        html.classList.add('overflow-hidden');
        body.classList.add('overflow-hidden');
        html.style.overscrollBehavior = 'none';
        body.style.overscrollBehavior = 'none';
        active = true;
      } else if (!mq.matches && active) {
        html.classList.remove('overflow-hidden');
        body.classList.remove('overflow-hidden');
        html.style.overscrollBehavior = prevHtmlOB;
        body.style.overscrollBehavior = prevBodyOB;
        active = false;
      }
    }
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      html.classList.remove('overflow-hidden');
      body.classList.remove('overflow-hidden');
      html.style.overscrollBehavior = prevHtmlOB;
      body.style.overscrollBehavior = prevBodyOB;
    };
  }, []);

  const {
    socket,
    state,
    participants,
    messages,
    connected,
    error,
    sendMove,
    startEdit,
    updateEdit,
    endEdit,
    resetPosition,
    sendChat,
    setMode,
    setAnnotations,
    undoMove,
    resetToInitial,
  } = useRoomSocket(room.code);

  const audio = useAudioRoom(socket);

  const fen = state?.fen ?? STARTING_FEN;
  const isEditing = state?.isEditing ?? false;
  const mode = state?.mode ?? DEFAULT_ROOM_MODE;
  const history = state?.history ?? [];
  const segmentStartFen = state?.segmentStartFen ?? state?.fen ?? STARTING_FEN;
  const arrows = state?.arrows ?? [];
  const marks = state?.marks ?? [];
  const roomKind = state?.kind ?? 'lesson';

  // Только владелец lesson-комнаты управляет режимом; ученики могут редактировать,
  // если учитель открыл редактор и разрешил всем редактирование.
  const canEditNow = isEditing && (isOwner || mode.studentsCanEdit);

  const [copied, setCopied] = useState(false);

  // viewIdx ∈ [-1 .. history.length-1]; -1 = стартовая позиция, history.length-1 = текущая.
  const [viewIdx, setViewIdx] = useState<number>(-1);
  const followLatestRef = useRef<boolean>(true);

  // Когда история удлинилась и пользователь «следовал за партией» — переключаемся на последний ход.
  useEffect(() => {
    if (isEditing) return;
    if (followLatestRef.current) setViewIdx(history.length - 1);
  }, [history.length, isEditing]);

  // При входе в редактор — следим за свежей позицией, чтобы видеть правки.
  useEffect(() => {
    if (isEditing) {
      followLatestRef.current = true;
      setViewIdx(history.length - 1);
    }
  }, [isEditing, history.length]);

  function selectHistoryIdx(idx: number) {
    const clamped = Math.max(-1, Math.min(history.length - 1, idx));
    followLatestRef.current = clamped === history.length - 1;
    setViewIdx(clamped);
  }

  const lastIdx = history.length - 1;
  const isViewingPast = viewIdx < lastIdx;
  const startFen = segmentStartFen;
  const viewFen = viewIdx === -1 ? startFen : history[viewIdx]?.fen ?? fen;

  const goPrev = () => selectHistoryIdx(viewIdx - 1);
  const goNext = () => selectHistoryIdx(viewIdx + 1);
  const goStart = () => selectHistoryIdx(-1);
  const goEnd = () => selectHistoryIdx(lastIdx);

  const [draftFen, setDraftFen] = useState<string | null>(null);
  useEffect(() => {
    if (isEditing && canEditNow && draftFen === null) setDraftFen(fen);
    if (!isEditing) setDraftFen(null);
  }, [isEditing, canEditNow, fen, draftFen]);

  function handleEditStart() {
    setDraftFen(fen);
    startEdit();
  }
  function handleEditChange(nextFen: string) {
    setDraftFen(nextFen);
    updateEdit(nextFen);
  }
  function handleEditEnd() {
    endEdit(draftFen ?? fen);
  }

  // ---- Промоушен пешки: задерживаем ход, открываем диалог ----
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null);
  const handlePromotionRequest = useCallback(
    (m: { from: string; to: string; color: 'w' | 'b' }) => {
      setPendingPromotion(m);
      return true; // ход обработан — отправлять будем по выбору пользователя
    },
    [],
  );
  function confirmPromotion(piece: 'q' | 'r' | 'b' | 'n') {
    if (!pendingPromotion) return;
    sendMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
    setPendingPromotion(null);
  }
  function cancelPromotion() {
    setPendingPromotion(null);
  }

  async function copyLink() {
    const url = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const canMove = !isEditing && connected && !isViewingPast;
  const displayFen = isEditing
    ? canEditNow && draftFen
      ? draftFen
      : fen
    : isViewingPast
      ? viewFen
      : fen;

  // ---- Игра против компьютера ----
  // Человек играет той стороной, чей ход в момент включения; компьютер — другой.
  const [vsComp, setVsComp] = useState<{ humanColor: 'w' | 'b' } | null>(null);
  const compEngine = useStockfish();
  const compFenRef = useRef<string | null>(null);

  useEffect(() => {
    if (vsComp && compEngine.ready) compEngine.setSkill(15);
  }, [vsComp, compEngine.ready, compEngine]);

  useEffect(() => {
    if (!vsComp || isEditing || isViewingPast) return;
    if (!compEngine.ready || compEngine.thinking) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === vsComp.humanColor) return;
    if (compFenRef.current === fen) return;
    compFenRef.current = fen;
    compEngine.analyse(fen, { movetime: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, vsComp, isEditing, isViewingPast, compEngine.ready, compEngine.thinking]);

  useEffect(() => {
    if (!vsComp) return;
    const m = compEngine.evaluation.bestmove;
    if (!m || m.length < 4) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === vsComp.humanColor) return;
    sendMove({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compEngine.evaluation.bestmove]);

  const togglePlayVsComputer = () => {
    if (vsComp) {
      setVsComp(null);
      return;
    }
    if (isEditing) {
      // Сначала закрываем редактор — иначе ход не уйдёт.
      handleEditEnd();
    }
    // Игра с компьютером всегда строго по правилам — выключаем «свободные ходы» и
    // фиксацию стороны, иначе движок будет противоречить состоянию доски.
    if (mode.allowIllegal || mode.sideLock) {
      setMode({ allowIllegal: false, sideLock: null });
    }
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    setVsComp({ humanColor: sideToMove });
  };

  // Если позиция стала нелегальной (после редактирования), глушим режим.
  useEffect(() => {
    if (!vsComp) return;
    if (!fen || fen.split(' ').length < 2) setVsComp(null);
    if (mode.allowIllegal || mode.sideLock) setVsComp(null);
  }, [fen, vsComp, mode.allowIllegal, mode.sideLock]);

  // Размер доски: на мобильном — почти на всю ширину, на десктопе ограничиваем высотой вьюпорта.
  const boardClassName =
    'relative z-10 aspect-square shrink-0 w-[min(96vw,480px)] lg:w-[min(94vw,480px,calc(100dvh-9.5rem))]';

  return (
    <main
      className={cn(
        'relative mx-auto flex w-full max-w-[1800px] flex-col px-2 pb-2 pt-0 sm:px-3',
        // На lg+ — фиксированный экран без скролла страницы; на мобильном — естественный flow.
        'lg:min-h-0 lg:flex-1 lg:overflow-hidden',
      )}
    >
      {error && (
        <div className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Верхняя строка с кнопками управления — над всем (и на мобильном, и на десктопе). */}
      <div className="flex shrink-0 justify-end gap-1 py-1">
        <button
          type="button"
          onClick={copyLink}
          className="btn-outline px-2 py-1 text-[11px] sm:text-xs"
          title="Копировать ссылку"
        >
          {copied ? '✓' : '🔗'}
        </button>
        {isOwner &&
          (isEditing ? (
            <button type="button" onClick={handleEditEnd} className="btn-primary px-2 py-1 text-[11px] sm:text-xs">
              ▶ Далее
            </button>
          ) : (
            <button type="button" onClick={handleEditStart} className="btn-primary px-2 py-1 text-[11px] sm:text-xs">
              ✎ Редактор
            </button>
          ))}
        {!isOwner && isEditing && mode.studentsCanEdit && (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            ✎ редактируете
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={resetPosition}
            className="btn-ghost px-2 py-1 text-[11px] sm:text-xs"
            title="Сброс позиции"
          >
            ↺
          </button>
        )}
      </div>

      {/* Адаптивный «движок» компоновки:
          - на телефоне: одна колонка, элементы по order-* (доска первая);
          - на десктопе: CSS grid в 3 колонки × 2 строки (как раньше). */}
      <div
        className={cn(
          'flex flex-1 flex-col gap-2',
          'lg:grid lg:min-h-0 lg:gap-3 lg:overflow-hidden',
          'lg:grid-cols-[13.5rem_1fr_13.75rem] xl:grid-cols-[13.5rem_1fr_15rem]',
          'lg:grid-rows-[auto_1fr]',
        )}
      >
        {/* ───────── ДОСКА + НАВИГАЦИЯ + ОТМЕНИТЬ ХОД ───────── */}
        <section
          className={cn(
            'order-1 flex flex-col items-center lg:order-none',
            'lg:col-start-2 lg:row-span-2 lg:min-h-0',
            isEditing ? 'overflow-visible' : 'lg:overflow-hidden',
          )}
        >
          {/* Доска (фиксированный квадрат). */}
          <div className={boardClassName}>
            <ChessBoard
              fen={displayFen}
              canMove={canMove}
              isEditing={isEditing}
              canEdit={canEditNow}
              allowIllegal={!vsComp && mode.allowIllegal}
              sideLock={vsComp ? null : mode.sideLock}
              canStartAnySide={!vsComp && !mode.allowIllegal && mode.sideLock === null && history.length === 0}
              onPromotionRequest={handlePromotionRequest}
              onMove={sendMove}
              onEditFen={handleEditChange}
              arrows={arrows}
              marks={marks}
              onAnnotationsChange={setAnnotations}
              compact
              fillContainer
              silent={isViewingPast}
            />
          </div>
          {/* Навигация по ходам + Отменить ход. На мобильном умещаем в одну строку,
              на широком — оставляем привычный вид. */}
          <div className="mt-1 flex w-[min(96vw,480px)] shrink-0 flex-wrap items-center justify-center gap-1.5 lg:w-[min(94vw,480px)]">
            <button
              type="button"
              onClick={goStart}
              disabled={viewIdx === -1}
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
              title="К началу партии"
            >
              «
            </button>
            <button
              type="button"
              onClick={goPrev}
              disabled={viewIdx === -1}
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
              title="Ход назад"
            >
              ‹
            </button>
            <div className="min-w-[5rem] flex-1 text-center text-xs font-semibold tabular-nums text-stone-500 sm:text-sm">
              {history.length === 0
                ? 'Старт'
                : isViewingPast
                  ? `Ход ${viewIdx + 1} / ${lastIdx + 1}`
                  : `Текущая · ход ${lastIdx + 1}`}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={!isViewingPast}
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
              title="Ход вперёд"
            >
              ›
            </button>
            <button
              type="button"
              onClick={goEnd}
              disabled={!isViewingPast}
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
              title="К текущей позиции"
            >
              »
            </button>
            {roomKind === 'lesson' && (
              <button
                type="button"
                onClick={undoMove}
                disabled={history.length === 0 || isEditing}
                className="shrink-0 rounded-lg border border-stone-300/80 bg-white/90 px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto dark:border-stone-600/70 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:bg-stone-700"
                title="Отменить последний ход"
              >
                ↩ Отменить ход
              </button>
            )}
          </div>
        </section>

        {/* ───────── АУДИО ─────────
            На мобильном — сразу под доской/навигацией.
            На десктопе — верхняя ячейка правой колонки (col 3, row 1). */}
        <section className="order-2 w-full lg:order-none lg:col-start-3 lg:row-start-1">
          <AudioPanel
            variant="compact"
            joined={audio.joined}
            micEnabled={audio.micEnabled}
            forcedMute={audio.forcedMute}
            participants={participants}
            meId={meId}
            isOwner={isOwner}
            levels={audio.levels}
            onJoin={audio.join}
            onLeave={audio.leave}
            onToggleMic={() => audio.setMic(!audio.micEnabled)}
            onForceMute={audio.forceMute}
            onForceMuteAll={audio.forceMuteAll}
          />
        </section>

        {/* ───────── РЕЖИМ + НАЧАЛЬНАЯ ПОЗИЦИЯ + ДВИЖОК (учителю) ─────────
            Мобильный: ниже аудио. Десктоп: левая колонка (col 1), на всю высоту. */}
        <section
          className={cn(
            'order-3 flex w-full flex-col gap-2 lg:order-none',
            'lg:col-start-1 lg:row-span-2 lg:min-h-0 lg:overflow-y-auto',
          )}
        >
          <ModePanel mode={mode} canEdit={isOwner} onChange={setMode} />
          {isOwner && roomKind === 'lesson' && (
            <button
              type="button"
              onClick={resetToInitial}
              disabled={isEditing}
              className="w-full rounded-xl border border-stone-200/80 bg-white/90 px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700/70 dark:bg-stone-900/65 dark:text-stone-200 dark:hover:bg-stone-800/80"
              title="Вернуть позицию к началу сегмента (как было сразу после редактора)"
            >
              ⟲ Начальная позиция
            </button>
          )}
          {/* Движок Stockfish — только для учителя: ученикам подсказки не показываем. */}
          {isOwner && (
            <EnginePanel
              fen={fen}
              variant="room"
              showPlayVsComputer={isOwner}
              vsComputerActive={!!vsComp}
              vsComputerThinking={!!vsComp && compEngine.thinking}
              onTogglePlayVsComputer={togglePlayVsComputer}
            />
          )}
        </section>

        {/* ───────── ИСТОРИЯ + ЧАТ ─────────
            Мобильный: в конце страницы. Десктоп: нижняя ячейка правой колонки (col 3, row 2). */}
        <section
          className={cn(
            'order-4 flex w-full flex-col gap-2 lg:order-none',
            'lg:col-start-3 lg:row-start-2 lg:min-h-0 lg:overflow-hidden',
          )}
        >
          <HistoryPanel
            history={history}
            viewIdx={viewIdx}
            onSelect={selectHistoryIdx}
            className="min-h-[6rem] max-h-[12rem] shrink-0"
          />
          {/* Чат: на мобильном — естественной высоты, на десктопе — расширяется до низа. */}
          <div className="flex min-h-[12rem] flex-col overflow-hidden lg:min-h-0 lg:flex-1">
            <ChatPanel variant="compact" messages={messages} meId={meId} onSend={sendChat} />
          </div>
        </section>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={confirmPromotion}
          onCancel={cancelPromotion}
        />
      )}
    </main>
  );
}
