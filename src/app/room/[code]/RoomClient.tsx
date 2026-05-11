'use client';

import { useEffect, useRef, useState } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { ChatPanel } from '@/components/room/ChatPanel';
import { AudioPanel } from '@/components/room/AudioPanel';
import { EnginePanel } from '@/components/room/EnginePanel';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { useStockfish } from '@/hooks/useStockfish';
import { STARTING_FEN } from '@/lib/socket-events';
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

/** Сторона доски в комнате — учитываем высоту: оставляем место под панель и стрелки. */
const BOARD_SIDE = 'min(94vw, 480px, calc(100dvh - 9.5rem))';

export function RoomClient({ meId, room }: Props) {
  const isOwner = meId === room.ownerId;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('overflow-hidden');
    body.classList.add('overflow-hidden');
    const prevHtmlOB = html.style.overscrollBehavior;
    const prevBodyOB = body.style.overscrollBehavior;
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    return () => {
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
  } = useRoomSocket(room.code);

  const audio = useAudioRoom(socket);

  const fen = state?.fen ?? STARTING_FEN;
  const isEditing = state?.isEditing ?? false;

  const [copied, setCopied] = useState(false);

  const [draftFen, setDraftFen] = useState<string | null>(null);
  useEffect(() => {
    if (isEditing && isOwner && draftFen === null) setDraftFen(fen);
    if (!isEditing) setDraftFen(null);
  }, [isEditing, isOwner, fen, draftFen]);

  // ---- История позиций для пролистывания «◂ ▸» ----
  // viewIdx — всегда валидный индекс в historyFens. Если равен последнему —
  // показываем «текущую» позицию и автоматически следуем за новыми ходами.
  const [historyFens, setHistoryFens] = useState<string[]>([fen]);
  const [viewIdx, setViewIdx] = useState<number>(0);
  const lastPushedRef = useRef<string>(fen);

  useEffect(() => {
    if (isEditing) return;
    if (fen === lastPushedRef.current) return;
    lastPushedRef.current = fen;
    setHistoryFens((h) => {
      if (h[h.length - 1] === fen) return h;
      const next = [...h, fen];
      // Если зритель находился на последней позиции — двигаемся вместе с историей.
      setViewIdx((idx) => (idx === h.length - 1 ? next.length - 1 : idx));
      return next;
    });
  }, [fen, isEditing]);

  // При входе в редактор — возвращаемся к самой свежей позиции, чтобы видеть правки.
  useEffect(() => {
    if (isEditing) setViewIdx(historyFens.length - 1);
  }, [isEditing, historyFens.length]);

  const totalHistory = historyFens.length;
  const lastIdx = totalHistory - 1;
  const isViewingPast = viewIdx < lastIdx;

  const goPrev = () => setViewIdx((i) => Math.max(0, i - 1));
  const goNext = () => setViewIdx((i) => Math.min(lastIdx, i + 1));
  const goStart = () => setViewIdx(0);
  const goEnd = () => setViewIdx(lastIdx);

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
    ? isOwner && draftFen
      ? draftFen
      : fen
    : isViewingPast
      ? historyFens[viewIdx] ?? fen
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
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    setVsComp({ humanColor: sideToMove });
  };

  // Если позиция стала нелегальной (после редактирования), глушим режим.
  useEffect(() => {
    if (!vsComp) return;
    if (!fen || fen.split(' ').length < 2) setVsComp(null);
  }, [fen, vsComp]);

  return (
    <main className="relative mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col overflow-hidden px-2 pb-2 pt-0 sm:px-3">
      {error && (
        <div className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Только кнопки — без названия комнаты и строки «учитель · код · ход» */}
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

      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col gap-2 overscroll-none lg:block lg:min-h-0',
          isEditing ? 'overflow-visible' : 'overflow-hidden',
        )}
      >
        {/* Игровая зона: узкий SF слева + доска (верх столбца совпадает с верхом сайдбара на lg). */}
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col lg:absolute lg:inset-0 lg:right-[13.75rem] lg:z-0 xl:right-60',
            isEditing ? 'overflow-visible' : 'overflow-hidden',
          )}
        >
          <div
            className={cn(
              'flex min-h-0 w-full flex-col gap-2 lg:h-full lg:flex-row lg:items-start lg:gap-3',
              isEditing
                ? 'overflow-visible lg:overflow-visible'
                : 'overflow-hidden lg:overflow-hidden',
            )}
          >
            <div className="w-full max-w-[14rem] shrink-0 sm:w-[12.5rem] lg:w-[13.5rem]">
              <EnginePanel
                fen={fen}
                variant="room"
                showPlayVsComputer={isOwner}
                vsComputerActive={!!vsComp}
                vsComputerThinking={!!vsComp && compEngine.thinking}
                onTogglePlayVsComputer={togglePlayVsComputer}
              />
            </div>
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col items-center justify-start pt-0',
                isEditing ? 'overflow-visible' : 'overflow-x-auto overflow-hidden',
              )}
            >
              {/* Фиксированный квадрат — доска не смещается при включении редактора (палитра — поверх слоя слева). */}
              <div
                className="relative z-10 aspect-square shrink-0"
                style={{ width: BOARD_SIDE, height: BOARD_SIDE, maxWidth: 480, maxHeight: 480 }}
              >
                <ChessBoard
                  fen={displayFen}
                  canMove={canMove}
                  isEditing={isEditing}
                  canEdit={isOwner && isEditing}
                  onMove={sendMove}
                  onEditFen={handleEditChange}
                  compact
                  fillContainer
                  silent={isViewingPast}
                />
              </div>
              {/* Навигация по ходам */}
              <div
                className="mt-1 flex shrink-0 items-center gap-1.5"
                style={{ width: BOARD_SIDE, maxWidth: 480, minHeight: '2.5rem' }}
              >
                <button
                  type="button"
                  onClick={goStart}
                  disabled={viewIdx === 0}
                  className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
                  title="К началу партии"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={viewIdx === 0}
                  className="btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl"
                  title="Ход назад"
                >
                  ‹
                </button>
                <div className="min-w-0 flex-1 text-center text-xs font-semibold tabular-nums text-stone-500 sm:text-sm">
                  {isViewingPast ? `Ход ${viewIdx} / ${lastIdx}` : `Текущая · ход ${lastIdx}`}
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
              </div>
            </div>
          </div>
        </div>

        <aside className="z-10 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:absolute lg:bottom-0 lg:right-0 lg:top-0 lg:w-[13.75rem] lg:flex-none lg:pb-2 xl:w-60">
          <div className="min-h-0 shrink-0 overflow-hidden">
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
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatPanel variant="compact" messages={messages} meId={meId} onSend={sendChat} />
          </div>
        </aside>
      </div>
    </main>
  );
}
