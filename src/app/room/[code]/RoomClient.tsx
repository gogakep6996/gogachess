'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { PromotionDialog } from '@/components/chess/PromotionDialog';
import { ChatPanel } from '@/components/room/ChatPanel';
import { AudioPanel } from '@/components/room/AudioPanel';
import { EnginePanel } from '@/components/room/EnginePanel';
import { HistoryPanel } from '@/components/room/HistoryPanel';
import { LibraryPanel } from '@/components/room/LibraryPanel';
import { ModePanel } from '@/components/room/ModePanel';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { useStockfish } from '@/hooks/useStockfish';
import { useClassAudio } from '@/contexts/ClassAudioContext';
import { DEFAULT_ROOM_MODE, STARTING_FEN } from '@/lib/socket-events';
import { getPiece, type Square } from '@/lib/fen';
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
  /** Встроенный режим: RoomClient рендерится внутри другой страницы (например,
   *  /class/me с верхней полосой «трансляции») — тогда доске нужен чуть больший
   *  верхний буфер в формуле высоты, чтобы нижняя нав-строка не обрезалась. */
  embedded?: boolean;
  /** Режим «ученик решает задачу учителя». Авто-включает движок (соперник),
   *  фиксирует цвет ученика, скрывает плашку «Ссылка» и панель «Режим». Сам
   *  движок и редактор позиции уже спрятаны для не-владельцев (isOwner=false). */
  studentTaskMode?: { humanColor: 'w' | 'b' };
  /** Контент, который рендерится в самом верху левой колонки (над чатом ученика).
   *  Используется страницей класса, чтобы разместить кнопку «На главную». */
  leftTopSlot?: ReactNode;
}

export function RoomClient({
  meId,
  room,
  embedded = false,
  studentTaskMode,
  leftTopSlot,
}: Props) {
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
    messages: roomMessages,
    connected,
    error,
    sendMove,
    startEdit,
    updateEdit,
    endEdit,
    resetPosition,
    sendChat: roomSendChat,
    setMode,
    setAnnotations,
    undoMove,
    resetToInitial,
    setHistoryView,
    toggleEngine,
    setMovesLock,
    setMoveAllow,
    clearChat: roomClearChat,
  } = useRoomSocket(room.code);

  // Когда RoomClient открыт внутри класса (под `<ClassAudioProvider>`),
  // берём аудио-mesh из контекста — он живёт у провайдера и НЕ пересобирается
  // при переключении главной колонки (дашборд ↔ доска ученика ↔ «Моя доска»).
  // Снаружи класса (`/room/[code]` standalone) контекста нет — поднимаем
  // собственный per-room mesh на сокете этой комнаты.
  // `useAudioRoom` вызываем ВСЕГДА (правила хуков), но с `null` под провайдером,
  // чтобы лишний WebRTC mesh не поднимался.
  const classAudio = useClassAudio();
  const ownAudio = useAudioRoom(classAudio ? null : socket);
  const audio = classAudio?.audio ?? ownAudio;
  const audioParticipants = classAudio?.participants ?? participants;

  // Чат: внутри класса используем ОБЩИЙ лобби-чат (один на весь класс), чтобы
  // ученики за своими досками, на трансляции и учитель всегда писали в один
  // канал и видели сообщения друг друга. Вне класса (`/room/[code]`) — свой
  // комнатный чат.
  const messages = classAudio?.messages ?? roomMessages;
  const sendChat = classAudio?.sendChat ?? roomSendChat;
  const clearChat = classAudio?.clearChat ?? roomClearChat;

  const fen = state?.fen ?? STARTING_FEN;
  const isEditing = state?.isEditing ?? false;
  const mode = state?.mode ?? DEFAULT_ROOM_MODE;
  const history = state?.history ?? [];
  const segmentStartFen = state?.segmentStartFen ?? state?.fen ?? STARTING_FEN;
  const arrows = state?.arrows ?? [];
  const marks = state?.marks ?? [];
  const roomKind = state?.kind ?? 'lesson';
  /** Lesson-подобные комнаты, в которых учитель распоряжается режимом, движком, отменой ходов и т.п.
   *  Это сам урок и сервисные комнаты раздела «Класс»: трансляция учителя и личные доски учеников. */
  const isLessonLike =
    roomKind === 'lesson' || roomKind === 'class-demo' || roomKind === 'student-board';
  /** Ученик-наблюдатель за трансляцией учителя — в class-demo он не должен «отменять ход»,
   *  чтобы не отбрасывать ход назад на доске у всех. */
  const isStudentInBroadcast = !isOwner && roomKind === 'class-demo';
  /** Может ли пользователь рисовать стрелки/выделять клетки. По требованию —
   *  ученикам в любых классных комнатах рисование отключаем (видеть стрелки учителя
   *  они продолжают, изменять не могут). */
  const canAnnotate = isOwner || !isLessonLike;
  /** Учитель запретил ученикам ходить на этой доске (например, на трансляции). */
  const studentMovesLocked = state?.studentMovesLocked ?? false;
  /** Кому единственному разрешено ходить при блокировке (userId) или null. */
  const allowedMoverUserId = state?.allowedMoverUserId ?? null;
  /** Заблокированы ли ходы лично для меня (я ученик, не входящий в исключение). */
  const movesBlockedForMe = !isOwner && studentMovesLocked && allowedMoverUserId !== meId;
  /** Серверный флаг: следующий ход — первый в текущем «свежем» отрезке.
   *  Если режим «оба» (sideLock===null) — этот ход можно сделать любой стороной. */
  const freshSegment = state?.freshSegment ?? history.length === 0;
  /** Индекс просматриваемой позиции, который выставил учитель и хочет показать ученикам. */
  const remoteViewIdx = state?.historyViewIdx ?? null;

  // Только владелец lesson-комнаты управляет режимом; ученики могут редактировать,
  // если учитель открыл редактор и разрешил всем редактирование.
  const canEditNow = isEditing && (isOwner || mode.studentsCanEdit);

  const [copied, setCopied] = useState(false);

  // Переворот доски (чёрные снизу). Локально для каждого пользователя.
  const [flipped, setFlipped] = useState(false);

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

  // Синхронизация с перемоткой учителя. Учеников всегда тянем в позицию учителя:
  // если учитель показывает прошлый ход — ученики тоже смотрят туда; если null — следят за актуальной.
  // Учителя при этом не дёргаем (его viewIdx — источник истины, который он сам обновил).
  useEffect(() => {
    if (isOwner) return;
    if (isEditing) return;
    if (remoteViewIdx === null) {
      followLatestRef.current = true;
      setViewIdx(history.length - 1);
    } else {
      const clamped = Math.max(-1, Math.min(history.length - 1, remoteViewIdx));
      followLatestRef.current = clamped === history.length - 1;
      setViewIdx(clamped);
    }
  }, [isOwner, isEditing, remoteViewIdx, history.length]);

  function selectHistoryIdx(idx: number) {
    const clamped = Math.max(-1, Math.min(history.length - 1, idx));
    followLatestRef.current = clamped === history.length - 1;
    setViewIdx(clamped);
    // Учитель транслирует своё положение в ленте всем ученикам в комнате.
    if (isOwner && isLessonLike) {
      const lastIdx = history.length - 1;
      setHistoryView(clamped >= lastIdx ? null : clamped);
    }
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

  const canMove = !isEditing && connected && !isViewingPast && !movesBlockedForMe;
  const displayFen = isEditing
    ? canEditNow && draftFen
      ? draftFen
      : fen
    : isViewingPast
      ? viewFen
      : fen;

  // ---- Игра против компьютера ----
  // humanColor === null: движок включён, но «человеческая» сторона ещё не определена
  // (только что включили / после reset / undo / editEnd). Первый ход в позиции
  // (любым из участников комнаты — учителем ИЛИ учеником) выставляет humanColor;
  // дальше движок отвечает противоположной стороной.
  // Если ученик решает задачу учителя — сразу включаем «vs computer» с
  // фиксированным цветом ученика. Дальше вся существующая логика vsComp
  // (анализ позиций, ответный ход движка) работает как для обычного «vs computer».
  const [vsComp, setVsComp] = useState<{ humanColor: 'w' | 'b' | null } | null>(
    studentTaskMode ? { humanColor: studentTaskMode.humanColor } : null,
  );
  const compEngine = useStockfish();
  const compFenRef = useRef<string | null>(null);
  // Уровень соперника при РУЧНОЙ игре в комнате (учитель выбирает в панели).
  // Для доски ученика уровень берётся из задачи (state.engineLevel) — см. engineSkill.
  const [vsCompSkill, setVsCompSkill] = useState(15);
  // Итоговая сила играющего движка: на доске ученика (student-board) — ВСЕГДА из
  // задачи (state.engineLevel, 20 = максимум без поддавков), независимо от того,
  // ученик это или зашедший учитель. Иначе (своя доска учителя) — из селектора панели.
  const engineSkill =
    studentTaskMode || roomKind === 'student-board' ? (state?.engineLevel ?? 20) : vsCompSkill;
  // Время на ход растёт с уровнем: на максимуме движку нужно больше посчитать,
  // чтобы не «шаффлить» в технике (например, мат слоном и конём).
  const compMoveTimeMs = 600 + Math.round(engineSkill * 30);

  // Управление движком на доске ученика теперь ведётся через серверный флаг
  // `state.engineEnabled` (см. socket-events). Поведение:
  //   • режим задачи + флаг ON → движок включён, играет за противоположную сторону;
  //   • режим задачи + флаг OFF → движок выключен (учитель выключил кнопкой);
  //   • НЕ режим задачи (ученик смотрит трансляцию class-demo или просто наблюдает) →
  //     движок выключен ВСЕГДА.
  // Учитель свой движок не запускает на чужой доске; кнопка ниже теперь дёргает
  // серверный флаг. Учительский локальный vsComp остаётся только для его собственной
  // «Моей доски» (class-demo, isOwner=true).
  const engineEnabledByServer = state?.engineEnabled ?? true;
  useEffect(() => {
    if (isOwner) return;
    const shouldBeOn = !!studentTaskMode && engineEnabledByServer;
    if (shouldBeOn) {
      if (!vsComp) {
        setVsComp({ humanColor: studentTaskMode.humanColor });
      }
    } else if (vsComp) {
      setVsComp(null);
      compEngine.stop();
      compFenRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, engineEnabledByServer, studentTaskMode]);
  /** Отслеживаем переход freshSegment false → true, чтобы один раз сбросить humanColor. */
  const prevFreshRef = useRef<boolean | null>(null);
  /** Отслеживаем длину истории — определяем humanColor только когда был сделан НОВЫЙ ход
   *  (history.length вырос), а не когда он был отменён (history.length уменьшился). */
  const prevHistoryLenRef = useRef<number>(0);

  useEffect(() => {
    if (vsComp && compEngine.ready) compEngine.setSkill(engineSkill);
  }, [vsComp, compEngine.ready, compEngine, engineSkill]);

  // На каждое «обновление позиции откатом» (reset / resetToInitial / undo / editEnd)
  // освобождаем выбор стороны: пусть первый следующий ход — теперь уже свежего сегмента —
  // снова определит, кто человек. Движок остаётся включённым.
  useEffect(() => {
    if (!vsComp) {
      prevFreshRef.current = null;
      return;
    }
    const curr = freshSegment;
    const prev = prevFreshRef.current;
    if (prev === null) {
      // Первый замер после включения vsComp — фиксируем, ничего не сбрасываем.
      prevFreshRef.current = curr;
      return;
    }
    prevFreshRef.current = curr;
    if (!prev && curr) {
      // Произошёл откат позиции → даём пользователю снова выбрать сторону.
      if (vsComp.humanColor !== null) {
        setVsComp({ humanColor: null });
        // Глушим движок, если он что-то считал на старую позицию.
        compEngine.stop();
        compFenRef.current = null;
      }
    }
  }, [freshSegment, vsComp, compEngine]);

  // Любой новый ход в комнате (от учителя или ученика) при включённом vsComp,
  // если сторона ещё не выбрана — определяет её по цвету этого хода.
  // ВАЖНО: реагируем только на РОСТ истории (новый ход), но не на её сжатие (undo),
  // иначе после отмены движок «вернёт» humanColor по уже-стёртому ходу.
  useEffect(() => {
    const prevLen = prevHistoryLenRef.current;
    prevHistoryLenRef.current = history.length;
    if (!vsComp || vsComp.humanColor !== null) return;
    if (isEditing) return;
    if (history.length === 0) return;
    if (history.length <= prevLen) return;
    const lastEntry = history[history.length - 1];
    // Цвет фигуры, сделавшей последний ход, определяем по фигуре на клетке «from»
    // в позиции ДО этого хода (предыдущая запись истории или старт сегмента).
    const prevFen =
      history.length === 1 ? segmentStartFen : history[history.length - 2].fen;
    const piece = getPiece(prevFen, lastEntry.from as Square);
    if (piece) {
      setVsComp({ humanColor: piece[0] as 'w' | 'b' });
    }
  }, [history.length, vsComp, isEditing, segmentStartFen, history]);

  useEffect(() => {
    if (!vsComp || isEditing || isViewingPast) return;
    // Сторона человека ещё не определена — ждём первый ход в комнате, движок молчит.
    if (vsComp.humanColor === null) return;
    // КРИТИЧНО: пока реальное состояние комнаты не пришло, fen = STARTING_FEN
    // (ход белых). Если задача за чёрных (humanColor='b'), движок успевал
    // сходить за белых на стартовой позиции — отсюда «холостой» первый ход.
    // Запускаем движок только на настоящей позиции с сервера.
    if (!state) return;
    if (!compEngine.ready || compEngine.thinking) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === vsComp.humanColor) return;
    if (compFenRef.current === fen) return;
    compFenRef.current = fen;
    compEngine.analyse(fen, { movetime: compMoveTimeMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, vsComp, isEditing, isViewingPast, state, compEngine.ready, compEngine.thinking, compMoveTimeMs]);

  useEffect(() => {
    if (!vsComp) return;
    if (vsComp.humanColor === null) return;
    const m = compEngine.evaluation.bestmove;
    if (!m || m.length < 4) return;
    // Sanity: ход от движка должен быть для актуальной позиции, а не для старой
    // (на которой мы запускали анализ до undo / reset).
    if (compFenRef.current !== fen) return;
    const sideToMove = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    if (sideToMove === vsComp.humanColor) return;
    sendMove({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compEngine.bestmoveSeq]);

  // Обёртка над sendMove: в vsComp с humanColor=null первый ход человека
  // (учителя) синхронно определяет его сторону, чтобы движок мог отреагировать
  // максимально быстро. Для ходов учеников это же делает useEffect выше.
  const sendMoveVsComp = useCallback(
    (m: { from: string; to: string; promotion?: string }) => {
      if (vsComp && vsComp.humanColor === null) {
        const piece = getPiece(fen, m.from as Square);
        if (piece) {
          setVsComp({ humanColor: piece[0] as 'w' | 'b' });
        }
      }
      sendMove(m);
    },
    [vsComp, fen, sendMove],
  );

  /** Защёлка: учитель только что включил vsComp и параллельно сбросил конфликтующий
   *  режим (sideLock/allowIllegal). Пока сервер не подтвердил сброс, конфликтный
   *  useEffect ниже не должен тут же выключать только что включённый vsComp. */
  const pendingVsCompModeResetRef = useRef(false);

  const togglePlayVsComputer = () => {
    if (vsComp) {
      setVsComp(null);
      compEngine.stop();
      compFenRef.current = null;
      return;
    }
    if (isEditing) {
      // Сначала закрываем редактор — иначе ход не уйдёт.
      handleEditEnd();
    }
    // Игра с компьютером всегда строго по правилам — выключаем «свободные ходы» и
    // фиксацию стороны, иначе движок будет противоречить состоянию доски.
    if (mode.allowIllegal || mode.sideLock) {
      pendingVsCompModeResetRef.current = true;
      setMode({ allowIllegal: false, sideLock: null });
    }
    // Всегда стартуем с null: первый ход в комнате (учителя или ученика, любой стороной)
    // определит «человеческую» сторону, дальше движок играет противоположной.
    setVsComp({ humanColor: null });
    prevHistoryLenRef.current = history.length;
  };

  // Если позиция стала нелегальной (после редактирования) или включили
  // «свободные ходы» / sideLock — режим vsComp несовместим, отключаем.
  useEffect(() => {
    if (!vsComp) return;
    if (!fen || fen.split(' ').length < 2) {
      setVsComp(null);
      compEngine.stop();
      compFenRef.current = null;
      return;
    }
    if (mode.allowIllegal || mode.sideLock) {
      // Ждём, пока сервер подтвердит сброс режима, инициированный самим toggle'ом vsComp.
      if (pendingVsCompModeResetRef.current) return;
      setVsComp(null);
      compEngine.stop();
      compFenRef.current = null;
    } else {
      // Режим стал «чистым» (или уже был) — снимаем защёлку.
      pendingVsCompModeResetRef.current = false;
    }
  }, [fen, vsComp, mode.allowIllegal, mode.sideLock, compEngine]);

  // Размер доски.
  // Мобильный: квадрат шириной min(96vw, 560px) — на больших телефонах/планшетах
  //   будет крупнее, чем раньше (раньше упирался в 480px).
  // Десктоп: ограничен сразу четырьмя факторами, чтобы у всех пользователей доска
  //   была максимально крупной и при этом ничего не наезжало на соседние блоки:
  //     • 94vw          — не вылазит за пределы окна;
  // ── Размер доски ──────────────────────────────────────────────────────
  // МОБИЛЬНЫЙ (< lg): не трогаем — `w-[min(96vw,480px)]`.
  // ДЕСКТОП (lg+): доска масштабируется ПРОПОРЦИОНАЛЬНО размеру окна, но так,
  // чтобы НИКОГДА не было наложений на боковые колонки/панели. Берём минимум из:
  //   • 100dvh − Yrem  — влезаем по высоте (Y = Header + статус-бар встроенного
  //                       режима). Доска квадратная (aspect-square), поэтому этот
  //                       лимит ограничивает и высоту, и ширину.
  //   • 100vw − 48rem  — оставляем место под обе боковые grid-колонки
  //                       (13.5rem + 13.75/15rem), gap'ы, паддинг страницы И
  //                       абсолютные «ушки» по бокам доски (≈128px слева у
  //                       ученика с «Начать заново» + ≈118px справа с nav/undo).
  //                       Доска центрирована в средней колонке, значит на каждый
  //                       бок остаётся (колонка − доска)/2 ≥ ~128px — «ушки»
  //                       помещаются, ничего не перекрывается.
  //   • 760px          — финальный hard-кап, чтобы на 2K/4K доска не разрасталась.
  // КРИТИЧНО: ширина задаётся явным calc/min — НЕ `w-full`. С `w-full` обёртка
  // `<div className="relative">` без собственной ширины схлопывается в ноль
  // внутри flex-секции с items-center (доска исчезала).
  // Резерв ширины под боковые колонки + боковую полоску доски:
  //   • ученик с задачей — слева ЕЩЁ одна полоска («Начать заново»), поэтому
  //     резервируем больше (48rem), иначе доска налезает на колонки;
  //   • во всех остальных случаях (учитель/трансляция) слева полоски нет —
  //     резерв 40rem, чтобы на узких экранах (iPad Pro портрет, 1024px) доска
  //     не сжималась до ~256px, а занимала ~384px и оставалась читаемой.
  // Есть ли СЛЕВА от доски доп. полоска (кнопка «Начать заново» для ученика).
  const hasLeftStrip = !isOwner && !!studentTaskMode;
  // В режиме редактора на телефоне/портрете доска перестаёт быть жёстко квадратной
  // на уровне контейнера: ChessBoard сам держит квадрат, а сверху/снизу появляются
  // полосы палитры фигур. Поэтому aspect-square оставляем только для ландшафта.
  const aspectCls = isEditing ? 'lg:landscape:aspect-square' : 'aspect-square';
  // На телефонах (≤480px) доска тянется во всю ширину экрана (full-bleed):
  // w-full заполняет родителя-обёртку, которой ниже задаётся w-screen.
  const boardBase = `relative z-10 mx-auto ${aspectCls} w-[min(96vw,480px)] max-[480px]:w-full`;
  // Портрет планшета (lg + portrait): боковые полоски кнопок уезжают ПОД доску,
  // поэтому доска занимает всю центральную колонку (до правого блока аудио).
  const portraitW = 'lg:portrait:w-[min(94vw,calc(100vw-29.5rem),760px)]';
  const boardClassName = hasLeftStrip
    ? embedded
      ? `${boardBase} lg:landscape:w-[min(94vw,calc(100dvh-6.5rem),calc(100vw-48rem),760px)] ${portraitW}`
      : `${boardBase} lg:landscape:w-[min(94vw,calc(100dvh-5rem),calc(100vw-48rem),760px)] ${portraitW}`
    : embedded
      ? `${boardBase} lg:landscape:w-[min(94vw,calc(100dvh-6.5rem),calc(100vw-40rem),760px)] ${portraitW}`
      : `${boardBase} lg:landscape:w-[min(94vw,calc(100dvh-5rem),calc(100vw-40rem),760px)] ${portraitW}`;

  return (
    <main
      className={cn(
        'relative mx-auto flex w-full max-w-[1800px] flex-col px-2 pb-2 pt-0 sm:px-3',
        // Фиксированный экран без скролла — только в ландшафте (ноуты, планшеты лёжа).
        // В портрете (например, iPad Pro 1024px стоя) — естественный flow, иначе
        // очень высокий экран растягивает чат вниз и сжимает доску.
        'lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:overflow-hidden',
      )}
    >
      {error && (
        <div className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Кнопки управления (копировать ссылку / ✎ Редактор / Сброс) теперь
          вынесены ВНУТРЬ board-секции ниже — там они в правом верхнем углу самой доски,
          не пересекаются с правой колонкой (аудио) и не отжимают другие блоки. */}

      {/* Адаптивный «движок» компоновки:
          - на телефоне: одна колонка, элементы по order-* (доска первая);
          - на десктопе: CSS grid в 3 колонки × 2 строки (как раньше). */}
      <div
        className={cn(
          'flex flex-1 flex-col gap-2',
          'lg:grid lg:gap-3',
          'lg:grid-cols-[13.5rem_1fr_12.5rem] xl:grid-cols-[13.5rem_1fr_15rem]',
          'lg:grid-rows-[auto_1fr]',
          // Высоту фиксируем (и прячем переполнение/скроллим внутри колонок) только
          // в ландшафте; в портрете сетка естественной высоты — чат не тянется вниз.
          'lg:landscape:min-h-0 lg:landscape:overflow-hidden',
        )}
      >
        {/* ───────── ДОСКА + БОКОВАЯ ПОЛОСКА КНОПОК ─────────
            На мобильном: вертикальный flow — actions сверху, доска, nav снизу.
            На lg+: доска центрируется в своей колонке грида. Боковая полоска
                  (aside) спозиционирована абсолютно относительно обёртки доски:
                  left:100% (правый край доски), top:0, bottom:0 → её высота
                  ровно равна высоте доски, и она не влияет на центрирование. */}
        <section
          className={cn(
            'order-1 flex flex-col items-center gap-2 lg:order-none',
            // overflow-visible нужен, чтобы абсолютно позиционированный aside
            // справа от доски не обрезался границей колонки грида.
            'lg:col-start-2 lg:row-start-1 lg:row-end-3 lg:min-h-0 lg:overflow-visible',
            // В ЛАНДШАФТЕ доска центрируется, а правая полоска кнопок висит
            // абсолютно у её правого края — резервируем справа место под полоску,
            // чтобы она не вылезала в колонку аудио/чата. В портрете полоска
            // уезжает под доску, поэтому резерв там не нужен.
            !hasLeftStrip && 'lg:landscape:pr-[7.5rem]',
          )}
        >
          {/* ── Мобильная верхняя action-строка (lg:hidden) ── */}
          <div className="mb-1 flex w-[min(96vw,480px)] shrink-0 justify-end gap-1 lg:hidden">
            <ActionButtons
              isOwner={isOwner}
              isEditing={isEditing}
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onReset={resetPosition}
              showStudentEditing={!isOwner && isEditing && mode.studentsCanEdit}
            />
          </div>

          {/* ── Библиотека (мобильная + портрет планшета): в ландшафте на lg+
                живёт в правой боковой полоске. ── */}
          {isOwner && isEditing && (
            <div className="mb-1 w-full max-w-[min(94vw,760px)] lg:landscape:hidden">
              <LibraryPanel onPick={(f) => handleEditChange(f)} />
            </div>
          )}

          {/* ── Доска (квадрат) + абсолютно позиционированный aside ──
              На телефоне (≤480px) обёртка занимает всю ширину экрана: будучи
              flex-элементом секции с items-center, она симметрично «вылезает»
              в боковые отступы страницы, и доска внутри идёт впритык к краям. */}
          <div className="relative max-[480px]:w-screen">
            {/* Левая боковая панель — только для ученика, решающего задачу учителя.
                Содержит «Начать заново», чтобы ученик мог переиграть задачу
                независимо от остальных. На мобильном — кнопка дублируется ниже. */}
            {!isOwner && studentTaskMode && (
              <aside className="absolute bottom-0 right-full top-0 mr-2 hidden w-[120px] flex-col justify-start gap-2 lg:landscape:flex">
                <div className="rounded-lg border border-stone-200/70 bg-paper/80 p-2 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/50">
                  <button
                    type="button"
                    onClick={resetToInitial}
                    disabled={isEditing}
                    className="w-full rounded-md border border-brand-300 bg-brand-50 px-2 py-1.5 text-[11px] font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60"
                    title="Сбросить задачу к стартовой позиции"
                  >
                    ⟲ Начать заново
                  </button>
                  <div className="mt-1 text-center text-[10px] text-stone-500 dark:text-stone-400">
                    Сброс к стартовой позиции задачи.
                  </div>
                </div>
              </aside>
            )}
            <div className={boardClassName}>
              <ChessBoard
                fen={displayFen}
                flipped={flipped}
                canMove={canMove}
                isEditing={isEditing}
                canEdit={canEditNow}
                allowIllegal={!vsComp && mode.allowIllegal}
                sideLock={vsComp ? null : mode.sideLock}
                canStartAnySide={
                  vsComp
                    ? vsComp.humanColor === null
                    : !mode.allowIllegal && mode.sideLock === null && freshSegment
                }
                onPromotionRequest={handlePromotionRequest}
                onMove={vsComp ? sendMoveVsComp : sendMove}
                onEditFen={handleEditChange}
                arrows={arrows}
                marks={marks}
                onAnnotationsChange={canAnnotate ? setAnnotations : undefined}
                compact
                fillContainer
                silent={isViewingPast}
              />
            </div>

            {/* Десктопная боковая полоска (hidden < lg). Абсолютно справа
                от доски, высота = высота доски (top:0, bottom:0). */}
            <aside className="absolute bottom-0 left-full top-0 ml-2 hidden w-[110px] flex-col gap-1.5 lg:landscape:flex">
              {/* Top: блок с action-кнопками (✎ Редактор / ↺) */}
              <div className="rounded-lg border border-stone-200/70 bg-paper/70 p-1.5 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/40">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <ActionButtons
                    isOwner={isOwner}
                    isEditing={isEditing}
                    onEditStart={handleEditStart}
                    onEditEnd={handleEditEnd}
                    onReset={resetPosition}
                    showStudentEditing={!isOwner && isEditing && mode.studentsCanEdit}
                    size="lg"
                  />
                </div>
              </div>

              {/* Библиотека позиций — только учителю и только в режиме редактора.
                  Занимает свободное место между кнопками и навигацией; клик по
                  позиции загружает её FEN на доску (комната и доска класса). */}
              {isOwner && isEditing && (
                <LibraryPanel compact onPick={(f) => handleEditChange(f)} />
              )}

              {/* Bottom: перевернуть + nav + Отменить (прижато к низу). */}
              <div className="mt-auto flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="w-full rounded-lg border border-stone-200/70 bg-paper/70 px-1.5 py-1.5 text-[11px] font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 dark:border-stone-700/60 dark:bg-stone-900/40 dark:text-stone-100 dark:hover:bg-stone-800"
                  title="Перевернуть доску"
                >
                  ⇅ Перевернуть
                </button>
                <div className="rounded-lg border border-stone-200/70 bg-paper/70 p-1.5 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/40">
                  <div className="flex items-center justify-between gap-0.5">
                    <NavButton onClick={goStart} disabled={viewIdx === -1} title="К началу" small>
                      «
                    </NavButton>
                    <NavButton onClick={goPrev} disabled={viewIdx === -1} title="Назад" small>
                      ‹
                    </NavButton>
                    <NavButton onClick={goNext} disabled={!isViewingPast} title="Вперёд" small>
                      ›
                    </NavButton>
                    <NavButton onClick={goEnd} disabled={!isViewingPast} title="К текущей" small>
                      »
                    </NavButton>
                  </div>
                  <div className="mt-1 text-center text-[10px] font-semibold tabular-nums text-stone-500">
                    {history.length === 0
                      ? 'Старт'
                      : isViewingPast
                        ? `${viewIdx + 1}/${lastIdx + 1}`
                        : `ход ${lastIdx + 1}`}
                  </div>
                  {isLessonLike && !isStudentInBroadcast && (
                    <button
                      type="button"
                      onClick={undoMove}
                      disabled={history.length === 0 || isEditing}
                      className="mt-1.5 w-full rounded-md border border-stone-300/80 bg-paper/90 px-1.5 py-1 text-[11px] font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600/70 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:bg-stone-700"
                      title="Отменить последний ход"
                    >
                      ↩ Отменить
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* ── Панель управления ПОД доской: планшет в ПОРТРЕТЕ (lg + portrait).
                В портрете правая боковая полоска уезжает сюда, а доска занимает
                всю центральную колонку. В ландшафте этот блок скрыт (полоска справа). ── */}
          <div className="mt-2 hidden w-full max-w-[min(94vw,760px)] flex-wrap items-center justify-center gap-2 lg:portrait:flex">
            <div className="flex items-center gap-1.5 rounded-lg border border-stone-200/70 bg-paper/70 p-1.5 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/40">
              <ActionButtons
                isOwner={isOwner}
                isEditing={isEditing}
                onEditStart={handleEditStart}
                onEditEnd={handleEditEnd}
                onReset={resetPosition}
                showStudentEditing={!isOwner && isEditing && mode.studentsCanEdit}
                size="lg"
              />
            </div>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="rounded-lg border border-stone-200/70 bg-paper/70 px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 dark:border-stone-700/60 dark:bg-stone-900/40 dark:text-stone-100 dark:hover:bg-stone-800"
              title="Перевернуть доску"
            >
              ⇅ Перевернуть
            </button>
            <div className="flex items-center rounded-lg border border-stone-200/70 bg-paper/70 px-2 py-1.5 shadow-sm dark:border-stone-700/60 dark:bg-stone-900/40">
              <NavRow
                goStart={goStart}
                goPrev={goPrev}
                goNext={goNext}
                goEnd={goEnd}
                isViewingPast={isViewingPast}
                viewIdx={viewIdx}
                historyLength={history.length}
                lastIdx={lastIdx}
              />
            </div>
            {isLessonLike && !isStudentInBroadcast && (
              <UndoButton onClick={undoMove} disabled={history.length === 0 || isEditing} />
            )}
            {!isOwner && studentTaskMode && (
              <button
                type="button"
                onClick={resetToInitial}
                disabled={isEditing}
                className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60"
                title="Сбросить задачу к стартовой позиции"
              >
                ⟲ Начать заново
              </button>
            )}
          </div>

          {/* ── Мобильная нижняя nav-строка (lg:hidden) ── */}
          <div className="mt-1 flex w-[min(96vw,480px)] shrink-0 flex-wrap items-center justify-center gap-1.5 lg:hidden">
            <NavRow
              goStart={goStart}
              goPrev={goPrev}
              goNext={goNext}
              goEnd={goEnd}
              isViewingPast={isViewingPast}
              viewIdx={viewIdx}
              historyLength={history.length}
              lastIdx={lastIdx}
            />
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="rounded-md border border-stone-300/80 bg-paper/90 px-2.5 py-1 text-[11px] font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 dark:border-stone-600/70 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:bg-stone-700"
              title="Перевернуть доску"
            >
              ⇅ Перевернуть
            </button>
            {isLessonLike && !isStudentInBroadcast && (
              <UndoButton onClick={undoMove} disabled={history.length === 0 || isEditing} />
            )}
            {!isOwner && studentTaskMode && (
              <button
                type="button"
                onClick={resetToInitial}
                disabled={isEditing}
                className="rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60"
                title="Сбросить задачу к стартовой позиции"
              >
                ⟲ Начать заново
              </button>
            )}
          </div>
        </section>

        {/* ───────── АУДИО ─────────
            На мобильном — сразу под доской/навигацией.
            На десктопе — верхняя ячейка правой колонки (col 3, row 1).
            Внутри класса берёт mesh из `ClassAudioProvider` (живёт у родителя,
            не пересобирается при переключении вида). Снаружи класса — собственный
            per-room WebRTC mesh. Список участников: в классе — все из лобби,
            снаружи — участники этой конкретной комнаты. */}
        <section className="order-2 w-full lg:order-none lg:col-start-3 lg:row-start-1">
          <AudioPanel
            variant="compact"
            joined={audio.joined}
            micEnabled={audio.micEnabled}
            forcedMute={audio.forcedMute}
            participants={audioParticipants}
            meId={meId}
            isOwner={isOwner}
            levels={audio.levels}
            onJoin={() => {
              audio.join().catch((err: unknown) => {
                // eslint-disable-next-line no-console
                console.warn('audio join failed', err);
              });
            }}
            onLeave={audio.leave}
            onToggleMic={() => audio.setMic(!audio.micEnabled)}
            onForceMute={audio.forceMute}
            onForceMuteAll={audio.forceMuteAll}
            inputDevices={audio.inputDevices}
            outputDevices={audio.outputDevices}
            currentInputId={audio.currentInputId}
            currentOutputId={audio.currentOutputId}
            outputSupported={audio.outputSupported}
            onRefreshDevices={(req) => {
              audio.refreshDevices(req).catch(() => undefined);
            }}
            onSelectInput={(id) => {
              audio.setInputDevice(id).catch(() => undefined);
            }}
            onSelectOutput={(id) => {
              audio.setOutputDevice(id).catch(() => undefined);
            }}
            spotlightUserId={allowedMoverUserId}
            onSelectParticipant={
              isOwner
                ? (p) => {
                    // Клик по строке ученика — toggle: даём слово+ход, повторный
                    // клик по тому же ученику забирает обе возможности обратно.
                    const isActive = allowedMoverUserId === p.userId;
                    if (isActive) {
                      audio.forceMute(p.socketId, true); // снова замьютить
                      setMoveAllow(null); // забрать право хода
                    } else {
                      audio.forceMute(p.socketId, false); // размьютить только его
                      setMoveAllow(p.userId); // разрешить ход только ему
                    }
                  }
                : undefined
            }
          />
        </section>

        {/* ───────── РЕЖИМ + НАЧАЛЬНАЯ ПОЗИЦИЯ + ДВИЖОК (учителю) ─────────
            Мобильный: ниже аудио. Десктоп: левая колонка (col 1), от верха грида до низа.
            Явный row-start-1 + row-end-3 нужен, иначе браузер auto-place может закинуть
            секцию в row 2, и колонка визуально «съезжает» вниз под пустое место. */}
        <section
          className={cn(
            'order-3 flex w-full flex-col gap-2 lg:order-none',
            'lg:col-start-1 lg:row-start-1 lg:row-end-3 lg:min-h-0',
            // Ученику тут живёт чат (слева от доски) — он должен растягиваться и
            // скроллиться внутри себя. Учителю — обычная колонка с прокруткой.
            isOwner ? 'lg:overflow-y-auto' : 'lg:overflow-hidden',
          )}
        >
          {leftTopSlot && <div className="shrink-0">{leftTopSlot}</div>}

          {/* Плашка «Ссылка» — только владельцу комнаты (учителю/автору комнаты).
              Ученикам, решающим задачу, ссылка на их личную доску не нужна. */}
          {isOwner && (
            <LinkBadge roomCode={room.code} copied={copied} onCopy={copyLink} />
          )}
          {/* Панель режимов: владельцу — полная (можно менять), остальным —
              скрываем (студенту с задачей лишний UI ни к чему). */}
          {isOwner && (
            <ModePanel mode={mode} canEdit={isOwner} onChange={setMode} />
          )}
          {isOwner && isLessonLike && (
            <button
              type="button"
              onClick={resetToInitial}
              disabled={isEditing}
              className="w-full rounded-xl border border-stone-200/80 bg-paper/90 px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700/70 dark:bg-stone-900/65 dark:text-stone-200 dark:hover:bg-stone-800/80"
              title="Вернуть позицию к началу сегмента (как было сразу после редактора)"
            >
              ⟲ Вернуть мою позицию
            </button>
          )}
          {/* Движок Stockfish — только для учителя: ученикам подсказки не показываем.
              В student-board (учитель пришёл за доску ученика) кнопка управляет
              СЕРВЕРНЫМ флагом engineEnabled, чтобы движок ученика продолжал
              играть и переживал входы/выходы учителя. В остальных случаях
              (моя доска / трансляция и т.п.) — обычная локальная игра учителя
              против движка. */}
          {isOwner && roomKind === 'student-board' ? (
            <EnginePanel
              fen={fen}
              variant="room"
              showPlayVsComputer
              vsComputerActive={engineEnabledByServer}
              vsComputerThinking={false}
              onTogglePlayVsComputer={() => toggleEngine(!engineEnabledByServer)}
              lockedSkill={state?.engineLevel ?? 20}
            />
          ) : (
            isOwner && (
              <EnginePanel
                fen={fen}
                variant="room"
                showPlayVsComputer={isOwner}
                vsComputerActive={!!vsComp}
                vsComputerThinking={!!vsComp && compEngine.thinking}
                onTogglePlayVsComputer={togglePlayVsComputer}
                onSkillChange={setVsCompSkill}
              />
            )
          )}

          {/* Блокировка ходов учеников (трансляция/урок): учитель запрещает всем
              ходить; затем клик по никнейму в аудио-панели разрешает одному. */}
          {isOwner && (roomKind === 'class-demo' || roomKind === 'lesson') && (
            <div className="w-full rounded-xl border border-stone-200/80 bg-paper/90 p-2.5 shadow-sm dark:border-stone-700/70 dark:bg-stone-900/65">
              <button
                type="button"
                onClick={() => setMovesLock(!studentMovesLocked)}
                className={cn(
                  'flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                  studentMovesLocked
                    ? 'border-amber-500/70 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200'
                    : 'border-stone-300/70 bg-stone-100 text-stone-700 hover:bg-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
                )}
                title="Запретить ученикам делать ходы на этой доске"
              >
                <span>{studentMovesLocked ? '🔒 Ходы ученикам запрещены' : '🔓 Ученики могут ходить'}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white',
                    studentMovesLocked ? 'bg-amber-600/80' : 'bg-brand-500',
                  )}
                >
                  {studentMovesLocked ? 'Разрешить' : 'Запретить'}
                </span>
              </button>
              {studentMovesLocked && (
                <div className="mt-1 text-[10px] leading-snug text-stone-500 dark:text-stone-400">
                  {allowedMoverUserId
                    ? 'Ходить может выбранный ученик (подсвечен в аудио). Клик по другому никнейму — передать ход ему.'
                    : 'Никто из учеников не может ходить. Нажмите на никнейм ученика в аудио-панели, чтобы разрешить ходить только ему.'}
                </div>
              )}
            </div>
          )}

          {/* Чат ученика — слева от доски (для не-владельца). */}
          {!isOwner && (
            <div className="flex min-h-[12rem] flex-col overflow-hidden lg:min-h-0 lg:flex-1">
              <ChatPanel variant="compact" messages={messages} meId={meId} onSend={sendChat} />
            </div>
          )}
        </section>

        {/* ───────── ИСТОРИЯ + ЧАТ ─────────
            Мобильный: в конце страницы. Десктоп: правая колонка (col 3), row 2.
            Над ним — секция АУДИО (row 1). */}
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
            className="min-h-[4rem] max-h-[6rem] shrink-0"
          />
          {/* Чат: для учителя — здесь, справа (с кнопкой «очистить»). У ученика
              чат вынесен в левую колонку (слева от доски), поэтому тут его нет. */}
          {isOwner && (
            <div className="flex min-h-[12rem] flex-col overflow-hidden lg:min-h-0 lg:flex-1">
              <ChatPanel
                variant="compact"
                messages={messages}
                meId={meId}
                onSend={sendChat}
                onClear={clearChat}
              />
            </div>
          )}
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

// ───────────────────────────────────────────────────────────────
// Маленькие переиспользуемые подкомпоненты для action / nav-row,
// чтобы не дублировать markup между мобильной и десктопной вёрсткой.
// ───────────────────────────────────────────────────────────────

function LinkBadge({
  roomCode,
  copied,
  onCopy,
}: {
  roomCode: string;
  copied: boolean;
  onCopy: () => void;
}) {
  // SSR не знает window.location.origin → начинаем с относительного пути.
  // После маунта useEffect подставляет полный URL. Так первый рендер на
  // клиенте совпадает с серверным — нет hydration mismatch.
  const [url, setUrl] = useState<string>(`/room/${roomCode}`);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUrl(`${window.location.origin}/room/${roomCode}`);
    }
  }, [roomCode]);
  return (
    <button
      type="button"
      onClick={onCopy}
      title="Скопировать ссылку на комнату"
      className="group flex w-full flex-col items-stretch gap-1 rounded-xl border border-stone-200/80 bg-paper/90 px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/60 dark:border-stone-700/70 dark:bg-stone-900/65 dark:hover:border-brand-700 dark:hover:bg-brand-900/20"
    >
      <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        <span>Ссылка</span>
        <span
          className={cn(
            'rounded px-1 py-px text-[9px] font-semibold',
            copied
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-stone-100 text-stone-500 group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-stone-800 dark:text-stone-400 dark:group-hover:bg-brand-900/40 dark:group-hover:text-brand-200',
          )}
        >
          {copied ? '✓ Скопировано' : 'Копировать'}
        </span>
      </span>
      <span className="truncate font-mono text-[11px] text-brand-600 dark:text-brand-300">
        {url}
      </span>
    </button>
  );
}

function ActionButtons({
  isOwner,
  isEditing,
  onEditStart,
  onEditEnd,
  onReset,
  showStudentEditing,
  size = 'sm',
}: {
  isOwner: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onReset: () => void;
  showStudentEditing: boolean;
  size?: 'sm' | 'lg';
}) {
  // На обоих размерах «Редактор» теперь компактный (как в исходной версии),
  // а ↺ Сброс на size="lg" остаётся крупным, но на 15% меньше предыдущего.
  const editorCls = 'btn-primary px-2 py-1 text-[11px] sm:text-xs';
  const resetCls =
    size === 'lg'
      ? 'btn-ghost px-2.5 py-1.5 text-xl leading-none'
      : 'btn-ghost px-2 py-1 text-[11px] sm:text-xs';
  const badgeCls = 'rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  return (
    <>
      {isOwner &&
        (isEditing ? (
          <button type="button" onClick={onEditEnd} className={editorCls}>
            ▶ Далее
          </button>
        ) : (
          <button type="button" onClick={onEditStart} className={editorCls}>
            ✎ Редактор
          </button>
        ))}
      {showStudentEditing && <span className={badgeCls}>✎ редактируете</span>}
      {isOwner && (
        <button type="button" onClick={onReset} className={resetCls} title="Сброс позиции">
          ↺
        </button>
      )}
    </>
  );
}

function NavRow({
  goStart,
  goPrev,
  goNext,
  goEnd,
  isViewingPast,
  viewIdx,
  historyLength,
  lastIdx,
}: {
  goStart: () => void;
  goPrev: () => void;
  goNext: () => void;
  goEnd: () => void;
  isViewingPast: boolean;
  viewIdx: number;
  historyLength: number;
  lastIdx: number;
}) {
  return (
    <>
      <NavButton onClick={goStart} disabled={viewIdx === -1} title="К началу партии">
        «
      </NavButton>
      <NavButton onClick={goPrev} disabled={viewIdx === -1} title="Ход назад">
        ‹
      </NavButton>
      <div className="min-w-[5rem] flex-1 text-center text-xs font-semibold tabular-nums text-stone-500 sm:text-sm">
        {historyLength === 0
          ? 'Старт'
          : isViewingPast
            ? `Ход ${viewIdx + 1} / ${lastIdx + 1}`
            : `Текущая · ход ${lastIdx + 1}`}
      </div>
      <NavButton onClick={goNext} disabled={!isViewingPast} title="Ход вперёд">
        ›
      </NavButton>
      <NavButton onClick={goEnd} disabled={!isViewingPast} title="К текущей позиции">
        »
      </NavButton>
    </>
  );
}

function NavButton({
  onClick,
  disabled,
  title,
  children,
  small,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        small
          ? 'btn-ghost shrink-0 px-1 py-0.5 text-base font-black leading-none disabled:opacity-40'
          : 'btn-ghost shrink-0 px-2.5 py-1.5 text-[22px] font-black leading-none disabled:opacity-40 sm:text-2xl'
      }
    >
      {children}
    </button>
  );
}

function UndoButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-lg border border-stone-300/80 bg-paper/90 px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto dark:border-stone-600/70 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:bg-stone-700"
      title="Отменить последний ход"
    >
      ↩ Отменить ход
    </button>
  );
}
