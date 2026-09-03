'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowCounterClockwise,
  ArrowsDownUp,
  ArrowUUpLeft,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Copy,
  DownloadSimple,
  PencilSimple,
  Play,
  Robot,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { MoveNav } from '@/components/chess/MoveNav';
import { PromotionDialog } from '@/components/chess/PromotionDialog';
import { FloatingChat } from '@/components/class/FloatingChat';
import { EnginePanel } from '@/components/room/EnginePanel';
import { HistoryPanel } from '@/components/room/HistoryPanel';
import { LibraryPanel } from '@/components/room/LibraryPanel';
import { ModePanel } from '@/components/room/ModePanel';
import { RoomChat } from '@/components/room/RoomChat';
import { RoomParticipants } from '@/components/room/RoomParticipants';
import {
  FieldLabel,
  IconButton,
  Panel,
  Segmented,
  StatusChip,
  SwitchRow,
  ToolButton,
} from '@/components/room/ui';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { useStockfish } from '@/hooks/useStockfish';
import { useClassAudio } from '@/contexts/ClassAudioContext';
import {
  DEFAULT_ROOM_MODE,
  STARTING_FEN,
  type MoveTreeNode,
  type PastGameDto,
} from '@/lib/socket-events';
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
    setHistoryViewNode,
    loadPastGame,
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
  /** Доска ученика в классе (личная доска задачи). Владелец такой комнаты — учитель. */
  const isStudentBoard = roomKind === 'student-board';
  /** Ученик-наблюдатель за трансляцией учителя — в class-demo он не должен «отменять ход»,
   *  чтобы не отбрасывать ход назад на доске у всех. */
  const isStudentInBroadcast = !isOwner && roomKind === 'class-demo';
  /** Присутствует ли учитель (владелец) прямо сейчас за этой доской. На доске
   *  ученика это означает «учитель зашёл за доску» → режим совместного разбора. */
  const ownerPresent = useMemo(
    () => participants.some((p) => p.userId === room.ownerId),
    [participants, room.ownerId],
  );
  /** Разбор на доске ученика: учитель зашёл за доску. В этом режиме и ученик, и
   *  учитель могут перематывать историю и ветвиться (но не за цвет движка). */
  const reviewByTeacher = isStudentBoard && ownerPresent;
  /** Цвет ученика (человека) на доске задачи. Приходит с сервера для student-board;
   *  как запас — из studentTaskMode. Движок играет противоположным цветом. */
  const boardHumanColor: 'w' | 'b' | null =
    state?.humanColor ?? studentTaskMode?.humanColor ?? null;
  /** Кто «ведёт» общую перемотку (транслирует просматриваемый узел в комнату):
   *  на доске ученика — и учитель, и ученик (только когда учитель зашёл, режим
   *  разбора); в lesson/class-demo — только учитель. */
  const canDriveNav = isStudentBoard ? reviewByTeacher : isOwner && isLessonLike;
  /** Кто «следует» за общей перемоткой: на доске ученика во время разбора — оба
   *  (видят навигацию друг друга); в остальных комнатах — ученики за учителем.
   *  Пока ученик решает задачу один (учителя нет) — листает историю локально. */
  const followsRemoteNav = isStudentBoard ? reviewByTeacher : !isOwner;
  /** Кнопка «Отменить ход». Скрываем её ученику на доске задачи (student-board):
   *  во время задачи ученик не откатывает ходы — это делает только учитель. */
  const canUndo = isLessonLike && !isStudentInBroadcast && !(isStudentBoard && !isOwner);
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

  // ── Дерево ходов (варианты как в Lichess) — только в учебных комнатах. ──
  const moveTree = state?.moveTree ?? [];
  const currentNodeId = state?.currentNodeId ?? null;
  const pastGames = state?.pastGames ?? [];
  const remoteViewNodeId = state?.historyViewNodeId ?? null;
  /** В учебных комнатах включаем навигацию по дереву (ветки). */
  const treeMode = isLessonLike;
  const nodeMap = useMemo(() => {
    const m = new Map<string, MoveTreeNode>();
    for (const n of moveTree) m.set(n.id, n);
    return m;
  }, [moveTree]);
  const childrenMap = useMemo(() => {
    const m = new Map<string | null, MoveTreeNode[]>();
    for (const n of moveTree) {
      const arr = m.get(n.parentId) ?? [];
      arr.push(n);
      m.set(n.parentId, arr);
    }
    return m;
  }, [moveTree]);
  const nodeChildren = useCallback(
    (id: string | null) => childrenMap.get(id) ?? [],
    [childrenMap],
  );
  /** Путь id-узлов от корня до заданного узла (для навигации по активной линии). */
  const pathToNode = useCallback(
    (id: string | null): string[] => {
      const out: string[] = [];
      let cur = id ? nodeMap.get(id) : undefined;
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        out.push(cur.id);
        cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
      }
      out.reverse();
      return out;
    },
    [nodeMap],
  );

  // Только владелец lesson-комнаты управляет режимом; ученики могут редактировать,
  // если учитель открыл редактор и разрешил всем редактирование.
  const canEditNow = isEditing && (isOwner || mode.studentsCanEdit);

  const [copied, setCopied] = useState(false);
  /** Открыт ли просмотр прошлых партий ученика (для учителя). */
  const [pastGamesOpen, setPastGamesOpen] = useState(false);
  /** Активная вкладка панели инструментов учителя (левая колонка).
   *  Обе вкладки остаются в DOM и лишь прячутся: иначе размонтирование
   *  EnginePanel остановило бы уже запущенный расчёт Stockfish. */
  const [toolTab, setToolTab] = useState<'board' | 'engine'>('board');

  // Переворот доски (чёрные снизу). Локально для каждого пользователя.
  // Ученик в режиме задачи (домашка/раздача) должен сразу видеть доску со
  // своей стороны — как на мини-доске карточки (та повёрнута по sideToPlay).
  // Поэтому стартовую ориентацию берём из его цвета: играет за чёрных → флип.
  const [flipped, setFlipped] = useState<boolean>(
    () => studentTaskMode?.humanColor === 'b',
  );
  // Если «человеческая» сторона приходит с сервера позже (раздача на уроке),
  // один раз доворачиваем доску под неё. Ручной переворот после этого сохраняется.
  const autoOrientedRef = useRef(false);
  useEffect(() => {
    if (isOwner || !studentTaskMode) return;
    if (autoOrientedRef.current) return;
    if (boardHumanColor === null) return;
    autoOrientedRef.current = true;
    setFlipped(boardHumanColor === 'b');
  }, [isOwner, studentTaskMode, boardHumanColor]);

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

  // ── Навигация по дереву ходов (варианты). Активна в учебных комнатах. ──
  const [viewNodeId, setViewNodeId] = useState<string | null>(null);
  const followTreeRef = useRef<boolean>(true);

  // Следуем за «живым» кончиком, пока пользователь не ушёл в историю.
  useEffect(() => {
    if (!treeMode || isEditing) return;
    if (followTreeRef.current) setViewNodeId(currentNodeId);
  }, [treeMode, isEditing, currentNodeId]);

  // Просматриваемый узел удалили из дерева (отмена хода вырезает поддерево) —
  // возвращаемся к живой позиции, иначе viewNodeId навсегда останется битым.
  useEffect(() => {
    if (!treeMode || viewNodeId === null) return;
    if (!nodeMap.has(viewNodeId)) {
      followTreeRef.current = true;
      setViewNodeId(currentNodeId);
    }
  }, [treeMode, viewNodeId, nodeMap, currentNodeId]);

  useEffect(() => {
    if (treeMode && isEditing) {
      followTreeRef.current = true;
      setViewNodeId(currentNodeId);
    }
  }, [treeMode, isEditing, currentNodeId]);

  // Следуем за узлом, который показывает «ведущий» перемотки. На доске ученика
  // во время разбора это взаимно: и ученик, и учитель видят навигацию друг друга.
  useEffect(() => {
    if (!treeMode || isEditing || !followsRemoteNav) return;
    if (remoteViewNodeId === null) {
      followTreeRef.current = true;
      setViewNodeId(currentNodeId);
    } else {
      followTreeRef.current = false;
      setViewNodeId(remoteViewNodeId);
    }
  }, [treeMode, isEditing, followsRemoteNav, remoteViewNodeId, currentNodeId]);

  const selectTreeNode = useCallback(
    (id: string | null) => {
      setViewNodeId(id);
      followTreeRef.current = id === currentNodeId;
      if (canDriveNav) {
        setHistoryViewNode(id === currentNodeId ? null : id);
      }
    },
    [currentNodeId, canDriveNav, setHistoryViewNode],
  );

  // Учитель ушёл с доски ученика (был за доской → вышел). Возвращаем ученика к
  // «живой» позиции: иначе он остаётся прикреплён к узлу, который показывал
  // учитель во время разбора, и не может продолжить игру (req: «после перемотки
  // учителя ученик снова может ходить»).
  const prevOwnerPresentRef = useRef(ownerPresent);
  useEffect(() => {
    const was = prevOwnerPresentRef.current;
    prevOwnerPresentRef.current = ownerPresent;
    if (isStudentBoard && !isOwner && was && !ownerPresent) {
      followTreeRef.current = true;
      setViewNodeId(currentNodeId);
    }
  }, [isStudentBoard, isOwner, ownerPresent, currentNodeId]);

  const treePrev = useCallback(() => {
    if (viewNodeId === null) return;
    const n = nodeMap.get(viewNodeId);
    selectTreeNode(n?.parentId ?? null);
  }, [viewNodeId, nodeMap, selectTreeNode]);

  const treeNext = useCallback(() => {
    // Вперёд по активной линии (к currentNodeId), вне её — в первый дочерний.
    const activePath = pathToNode(currentNodeId);
    if (viewNodeId === null) {
      const first = activePath[0] ?? nodeChildren(null)[0]?.id ?? null;
      if (first) selectTreeNode(first);
      return;
    }
    const idx = activePath.indexOf(viewNodeId);
    if (idx >= 0 && idx < activePath.length - 1) {
      selectTreeNode(activePath[idx + 1]);
      return;
    }
    const child = nodeChildren(viewNodeId)[0];
    if (child) selectTreeNode(child.id);
  }, [viewNodeId, currentNodeId, pathToNode, nodeChildren, selectTreeNode]);

  const treeStart = useCallback(() => selectTreeNode(null), [selectTreeNode]);
  const treeEnd = useCallback(
    () => selectTreeNode(currentNodeId),
    [selectTreeNode, currentNodeId],
  );

  const lastIdx = history.length - 1;
  const startFen = segmentStartFen;
  const viewNode = treeMode && viewNodeId ? nodeMap.get(viewNodeId) ?? null : null;
  const isViewingPast = treeMode ? viewNodeId !== currentNodeId : viewIdx < lastIdx;
  const viewFen = treeMode
    ? viewNode
      ? viewNode.fen
      : viewNodeId !== null
        ? // Узел удалён из дерева (отмена хода), а viewNodeId ещё не успел
          // синхронизироваться — показываем живую позицию, НЕ стартовую.
          // Иначе доска на кадр «прыгает» на начало партии и дёргаются фигуры.
          fen
        : startFen
    : viewIdx === -1
      ? startFen
      : history[viewIdx]?.fen ?? fen;
  /** В начале ли навигации (для отключения кнопок «назад»). */
  const atNavStart = treeMode ? viewNodeId === null : viewIdx === -1;
  /** В конце ли (на «живой» позиции). */
  const atNavEnd = treeMode ? viewNodeId === currentNodeId : viewIdx >= lastIdx;

  const goPrev = treeMode ? treePrev : () => selectHistoryIdx(viewIdx - 1);
  const goNext = treeMode ? treeNext : () => selectHistoryIdx(viewIdx + 1);
  const goStart = treeMode ? treeStart : () => selectHistoryIdx(-1);
  const goEnd = treeMode ? treeEnd : () => selectHistoryIdx(lastIdx);

  /** Номер просматриваемого полухода и всего в активной линии (для подписи навигации). */
  const totalPly = treeMode ? pathToNode(currentNodeId).length : lastIdx + 1;
  const viewPly = treeMode ? (viewNodeId ? pathToNode(viewNodeId).length : 0) : viewIdx + 1;

  // Перелистывание ходов стрелками, как в Lichess (← → и Home/End).
  const navRef = useRef({ goPrev, goNext, goStart, goEnd, isEditing });
  navRef.current = { goPrev, goNext, goStart, goEnd, isEditing };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      const nav = navRef.current;
      if (nav.isEditing) return;
      switch (e.key) {
        case 'ArrowLeft':
          nav.goPrev();
          e.preventDefault();
          break;
        case 'ArrowRight':
          nav.goNext();
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'Home':
          nav.goStart();
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 'End':
          nav.goEnd();
          e.preventDefault();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    commitMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
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

  // Ветвление «в прошлом» (новая ветка/вариант):
  //   • доска ученика (student-board) — только когда учитель зашёл за доску
  //     (разбор). Пока ученик решает задачу сам — историю можно листать, но
  //     свернуть в другую ветку нельзя (только просмотр);
  //   • lesson / class-demo — только владелец-учитель.
  const canBranchPast = isStudentBoard ? reviewByTeacher : treeMode && isOwner;
  const canMove =
    !isEditing && connected && !movesBlockedForMe && (canBranchPast || !isViewingPast);
  const displayFen = isEditing
    ? canEditNow && draftFen
      ? draftFen
      : fen
    : treeMode
      ? viewFen
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
  /** Движок-соперник активен на этой доске задачи (играет за цвет, противоположный
   *  ученику). Тогда ни ученику, ни зашедшему учителю нельзя ходить за цвет движка —
   *  доску ограничиваем цветом ученика (см. sideLock ниже). Если учитель выключил
   *  движок кнопкой — играем вручную любым цветом. */
  const engineActiveHere = isStudentBoard && engineEnabledByServer && !!boardHumanColor;
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

  // Единая отправка хода пользователя. В учебных комнатах добавляем fromNodeId
  // (узел, который сейчас показан) — если это не кончик активной линии, сервер
  // создаст новую ветку. В vsComp с humanColor=null первый ход определяет сторону.
  const commitMove = useCallback(
    (m: { from: string; to: string; promotion?: string }) => {
      if (vsComp && vsComp.humanColor === null) {
        const piece = getPiece(displayFen, m.from as Square);
        if (piece) {
          setVsComp({ humanColor: piece[0] as 'w' | 'b' });
        }
      }
      if (treeMode) {
        // После своего хода снова следуем за живым кончиком (новой веткой).
        followTreeRef.current = true;
        // Ветвимся только если реально смотрим прошлую позицию. Иначе (следим за
        // кончиком) не шлём fromNodeId — сервер продолжит от актуального узла, что
        // исключает ложную ветку из-за гонки состояния при быстрой линейной игре.
        const branching = viewNodeId !== currentNodeId;
        sendMove(branching ? { ...m, fromNodeId: viewNodeId } : m);
      } else {
        sendMove(m);
      }
    },
    [vsComp, displayFen, treeMode, viewNodeId, currentNodeId, sendMove],
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

  // ── Размер доски ──────────────────────────────────────────────────────
  // Боковых «полосок» кнопок больше нет: навигация и действия живут в единой
  // панели ПОД доской, поэтому доска стала крупнее и резервы проще.
  // МОБИЛЬНЫЙ (< lg): `w-[min(96vw,480px)]`, на ≤480px — во всю ширину экрана.
  // ДЕСКТОП (lg+ landscape): минимум из:
  //   • 94vw           — не вылазит за пределы окна;
  //   • 100dvh − Yrem  — влезаем по высоте (Y = Header ≈2.8rem + панель под
  //                       доской ≈3.2rem + паддинги; в embedded ещё +1.5rem
  //                       на верхнюю полосу класса);
  //   • 100vw − 34rem  — место под обе боковые колонки (15rem × 2), gap'ы и
  //                       паддинги страницы;
  //   • 760px          — hard-кап, чтобы на 2K/4K доска не разрасталась.
  // КРИТИЧНО: ширина задаётся явным calc/min — НЕ `w-full`, иначе обёртка без
  // собственной ширины схлопывается в ноль внутри flex-секции с items-center.
  const hasPastGames = isOwner && pastGames.length > 0;
  /** Движок сейчас играет за соперника — точка-индикатор на вкладке «Движок». */
  const engineIndicatorOn = roomKind === 'student-board' ? engineEnabledByServer : !!vsComp;
  // В режиме редактора на телефоне/портрете доска перестаёт быть жёстко квадратной
  // на уровне контейнера: ChessBoard сам держит квадрат, а сверху/снизу появляются
  // полосы палитры фигур. Поэтому aspect-square оставляем только для ландшафта.
  const aspectCls = isEditing ? 'lg:landscape:aspect-square' : 'aspect-square';
  // Обёртка задаёт ТОЛЬКО ширину: внутри доска (aspect-square) и панель навигации.
  const boardWrapClassName = embedded
    ? 'mx-auto w-[min(96vw,480px)] max-[480px]:w-screen lg:landscape:w-[min(94vw,calc(100dvh-9rem),calc(100vw-34rem),760px)]'
    : 'mx-auto w-[min(96vw,480px)] max-[480px]:w-screen lg:landscape:w-[min(94vw,calc(100dvh-7.5rem),calc(100vw-34rem),760px)]';

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
        <div
          role="alert"
          className="mb-2 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900"
        >
          {error}
        </div>
      )}

      {/* Адаптивный «движок» компоновки:
          - на телефоне: одна колонка, элементы по order-* (доска первая);
          - на десктопе: CSS grid в 3 колонки × 2 строки (как раньше). */}
      <div
        className={cn(
          'flex flex-1 flex-col gap-2',
          'lg:grid lg:gap-3',
          'lg:grid-cols-[15rem_1fr_15rem]',
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
            'lg:col-start-2 lg:row-start-1 lg:row-end-3 lg:min-h-0 lg:overflow-visible',
          )}
        >
          {/* ── Доска + единая панель управления ПОД ней ──
              Все действия с доской собраны в одной читабельной строке под
              доской (как у chess.com / lichess): навигация по ходам, переворот,
              отмена. Действия учителя (редактор, сброс) на десктопе живут в
              левой колонке, на телефоне дублируются здесь же — под рукой. */}
          <div className={boardWrapClassName}>
            <div className={`relative z-10 w-full ${aspectCls}`}>
              <ChessBoard
                fen={displayFen}
                flipped={flipped}
                canMove={canMove}
                isEditing={isEditing}
                canEdit={canEditNow}
                allowIllegal={!vsComp && mode.allowIllegal}
                sideLock={
                  engineActiveHere
                    ? boardHumanColor // движок включён → ходить можно только цветом ученика
                    : vsComp
                      ? null
                      : mode.sideLock
                }
                canStartAnySide={
                  engineActiveHere
                    ? false // за движок ходить нельзя, «любой стороной» здесь недопустимо
                    : vsComp
                      ? vsComp.humanColor === null
                      : !mode.allowIllegal && mode.sideLock === null && freshSegment
                }
                onPromotionRequest={handlePromotionRequest}
                onMove={commitMove}
                onEditFen={handleEditChange}
                arrows={arrows}
                marks={marks}
                onAnnotationsChange={canAnnotate ? setAnnotations : undefined}
                compact
                fillContainer
                silent={isViewingPast}
              />
            </div>

            {/* ── Пульт под доской ──
                Один инструментальный блок: перемотка партии, переворот и
                отмена хода. Высота ряда та же, что была раньше (42px вместе с
                отступом), поэтому размер доски не меняется. */}
            <div className="mt-1.5 flex w-full flex-wrap items-center justify-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-xl bg-white/90 p-0.5 shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ring-1 ring-stone-900/[0.07] backdrop-blur-sm dark:bg-stone-900/70 dark:ring-white/[0.08]">
                <IconButton
                  icon={CaretDoubleLeft}
                  label="К началу партии"
                  onClick={goStart}
                  disabled={atNavStart}
                />
                <IconButton
                  icon={CaretLeft}
                  label="Ход назад"
                  onClick={goPrev}
                  disabled={atNavStart}
                />
                <span className="min-w-[4rem] px-1 text-center text-[12px] font-semibold tabular-nums text-stone-500 dark:text-stone-400">
                  {totalPly === 0
                    ? 'Старт'
                    : isViewingPast
                      ? `${viewPly} / ${totalPly}`
                      : `ход ${totalPly}`}
                </span>
                <IconButton
                  icon={CaretRight}
                  label="Ход вперёд"
                  onClick={goNext}
                  disabled={atNavEnd}
                />
                <IconButton
                  icon={CaretDoubleRight}
                  label="К текущей позиции"
                  onClick={goEnd}
                  disabled={atNavEnd}
                />

                <span
                  aria-hidden
                  className="mx-1 h-5 w-px bg-stone-900/10 dark:bg-white/10"
                />

                <ToolButton
                  icon={ArrowsDownUp}
                  tone="quiet"
                  onClick={() => setFlipped((f) => !f)}
                  title="Показать доску с другой стороны"
                >
                  Перевернуть
                </ToolButton>

                {canUndo && (
                  <ToolButton
                    icon={ArrowUUpLeft}
                    tone="quiet"
                    onClick={undoMove}
                    disabled={history.length === 0 || isEditing}
                    title="Отменить последний ход"
                  >
                    Отменить
                  </ToolButton>
                )}
              </div>

              {/* Действия, которые на десктопе живут в левой колонке, на
                  телефоне должны быть под рукой — прямо под доской. */}
              <span className="contents lg:hidden">
                <ActionButtons
                  isOwner={isOwner}
                  isEditing={isEditing}
                  onEditStart={handleEditStart}
                  onEditEnd={handleEditEnd}
                  onReset={resetPosition}
                  showStudentEditing={!isOwner && isEditing && mode.studentsCanEdit}
                />
                {!isOwner && studentTaskMode && (
                  <ToolButton
                    icon={ArrowCounterClockwise}
                    onClick={resetToInitial}
                    disabled={isEditing}
                    title="Сбросить задачу к стартовой позиции"
                  >
                    Начать заново
                  </ToolButton>
                )}
                {hasPastGames && (
                  <ToolButton
                    icon={ClockCounterClockwise}
                    onClick={() => setPastGamesOpen(true)}
                    title="Партии ученика до «Начать заново»"
                  >
                    Прошлые партии ({pastGames.length})
                  </ToolButton>
                )}
              </span>
            </div>

            {/* Библиотека позиций на телефоне — под пультом, когда учитель
                в редакторе. На десктопе она в левой колонке. */}
            {isOwner && isEditing && (
              <div className="mt-2 w-full rounded-2xl bg-white/90 p-2 ring-1 ring-stone-900/[0.07] lg:hidden dark:bg-stone-900/70 dark:ring-white/[0.08]">
                <LibraryPanel onPick={(f) => handleEditChange(f)} />
              </div>
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
        <section className="order-2 flex w-full min-h-0 flex-col lg:order-none lg:col-start-3 lg:row-start-1 lg:max-h-[15rem]">
          <RoomParticipants
            className="min-h-0 flex-1"
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

        {/* ───────── ЛЕВАЯ КОЛОНКА: ПУЛЬТ УЧИТЕЛЯ / ЧАТ УЧЕНИКА ─────────
            Раньше здесь стопкой лежали восемь разных блоков, и на ноутбуке
            колонку приходилось прокручивать. Теперь это один пульт с двумя
            вкладками: «Доска» (редактор, библиотека, чей ход, права учеников)
            и «Движок». Обе вкладки остаются в DOM, скрытая просто не
            отображается — иначе Stockfish останавливался бы при переключении.
            Мобильный: ниже участников. Десктоп: колонка 1 во всю высоту. */}
        <section
          className={cn(
            'order-3 flex w-full min-h-0 flex-col gap-2 lg:order-none',
            'lg:col-start-1 lg:row-start-1 lg:row-end-3 lg:overflow-hidden',
          )}
        >
          {leftTopSlot && <div className="shrink-0">{leftTopSlot}</div>}

          {/* Ссылка-приглашение — только владельцу комнаты. Ученику, решающему
              задачу, ссылка на его личную доску не нужна. */}
          {isOwner && <LinkCard roomCode={room.code} copied={copied} onCopy={copyLink} />}

          {isOwner && (
            <Panel
              className="min-h-0 lg:flex-1"
              bodyClassName="flex min-h-0 flex-1 flex-col gap-2.5 p-2"
            >
              <Segmented
                ariaLabel="Инструменты урока"
                value={toolTab}
                onChange={setToolTab}
                options={[
                  { id: 'board', label: 'Доска', icon: SquaresFour },
                  { id: 'engine', label: 'Движок', icon: Robot, dot: engineIndicatorOn },
                ]}
              />

              {/* ── Вкладка «Доска» ── */}
              <div
                className={cn(
                  'min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5',
                  toolTab !== 'board' && 'hidden',
                )}
              >
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  {isEditing ? (
                    <ToolButton
                      icon={Play}
                      tone="primary"
                      size="md"
                      onClick={handleEditEnd}
                      title="Закрыть редактор и продолжить урок"
                    >
                      Далее
                    </ToolButton>
                  ) : (
                    <ToolButton
                      icon={PencilSimple}
                      tone="primary"
                      size="md"
                      onClick={handleEditStart}
                      title="Расставить фигуры на доске"
                    >
                      Редактор
                    </ToolButton>
                  )}
                  <IconButton
                    icon={ArrowCounterClockwise}
                    label="Сбросить позицию"
                    size="md"
                    tone="neutral"
                    onClick={resetPosition}
                  />
                </div>

                {/* Библиотека нужна ровно тогда, когда открыт редактор. */}
                {isEditing && <LibraryPanel onPick={(f) => handleEditChange(f)} />}

                <ModePanel mode={mode} canEdit={isOwner} onChange={setMode} />

                {/* Право хода учеников. Точечная выдача — кликом по ученику
                    в списке участников справа. */}
                {(roomKind === 'class-demo' || roomKind === 'lesson') && (
                  <SwitchRow
                    label="Ученики могут ходить"
                    hint={
                      studentMovesLocked
                        ? allowedMoverUserId
                          ? 'Ходит только выбранный ученик. Нажмите на другого в списке участников, чтобы передать ход ему.'
                          : 'Нажмите на ученика в списке участников, чтобы разрешить ход только ему.'
                        : undefined
                    }
                    checked={!studentMovesLocked}
                    onChange={(next) => setMovesLock(!next)}
                  />
                )}

                {isLessonLike && (
                  <ToolButton
                    icon={ArrowCounterClockwise}
                    block
                    onClick={resetToInitial}
                    disabled={isEditing}
                    title="Вернуть позицию к началу отрезка, как было сразу после редактора"
                  >
                    Вернуть позицию
                  </ToolButton>
                )}

                {hasPastGames && (
                  <ToolButton
                    icon={ClockCounterClockwise}
                    block
                    onClick={() => setPastGamesOpen(true)}
                    title="Партии ученика до «Начать заново»"
                  >
                    Прошлые партии ({pastGames.length})
                  </ToolButton>
                )}
              </div>

              {/* ── Вкладка «Движок» ──
                  На доске ученика (student-board) переключатель дёргает
                  СЕРВЕРНЫЙ флаг engineEnabled, чтобы движок ученика продолжал
                  играть и переживал входы и выходы учителя. В остальных
                  комнатах это обычная локальная игра учителя против движка. */}
              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5',
                  toolTab !== 'engine' && 'hidden',
                )}
              >
                {roomKind === 'student-board' ? (
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
                  <EnginePanel
                    fen={fen}
                    variant="room"
                    showPlayVsComputer
                    vsComputerActive={!!vsComp}
                    vsComputerThinking={!!vsComp && compEngine.thinking}
                    onTogglePlayVsComputer={togglePlayVsComputer}
                    onSkillChange={setVsCompSkill}
                  />
                )}
              </div>
            </Panel>
          )}

          {/* «Начать заново» — ученику, решающему задачу. На телефоне эта же
              кнопка уже есть в пульте под доской, поэтому здесь только с lg. */}
          {!isOwner && studentTaskMode && (
            <ToolButton
              className="hidden lg:inline-flex"
              icon={ArrowCounterClockwise}
              size="md"
              block
              onClick={resetToInitial}
              disabled={isEditing}
              title="Сбросить задачу к стартовой позиции"
            >
              Начать заново
            </ToolButton>
          )}

          {/* Чат ученика — слева от доски. У учителя чат живёт в плавающей
              кнопке в правом нижнем углу. */}
          {!isOwner && (
            <RoomChat
              className="min-h-[14rem] lg:min-h-0 lg:flex-1"
              messages={messages}
              meId={meId}
              onSend={sendChat}
            />
          )}
        </section>

        {/* ───────── ХОДЫ ─────────
            Мобильный: в конце страницы. Десктоп: правая колонка (col 3), row 2,
            под списком участников. Учителю резервируем низ колонки под
            плавающую кнопку чата, чтобы она ничего не перекрывала. */}
        <section
          className={cn(
            'order-4 flex w-full min-h-0 flex-col lg:order-none',
            'lg:col-start-3 lg:row-start-2 lg:overflow-hidden',
            isOwner && 'lg:pb-16',
          )}
        >
          <HistoryPanel
            history={history}
            viewIdx={viewIdx}
            onSelect={selectHistoryIdx}
            treeMode={treeMode}
            moveTree={moveTree}
            segmentStartFen={segmentStartFen}
            currentNodeId={currentNodeId}
            viewNodeId={viewNodeId}
            onSelectNode={selectTreeNode}
            className="min-h-[9rem] lg:min-h-0 lg:flex-1"
          />
        </section>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={confirmPromotion}
          onCancel={cancelPromotion}
        />
      )}

      {pastGamesOpen && (
        <PastGamesModal
          games={pastGames}
          flipped={flipped}
          onClose={() => setPastGamesOpen(false)}
          onLoad={(index) => {
            loadPastGame(index);
            setPastGamesOpen(false);
          }}
        />
      )}

      {/* Плавающая иконка чата для владельца/учителя (правый нижний угол).
          Внутри класса (под ClassAudioProvider) плавающий чат уже рисует
          ClassMeClient на уровне провайдера — тут его не дублируем (classAudio). */}
      {isOwner && !classAudio && (
        <FloatingChat
          messages={messages}
          meId={meId}
          onSend={sendChat}
          onClear={clearChat}
        />
      )}
    </main>
  );
}

/** Просмотр прошлых партий ученика (сохранённых при «Начать заново»). */
function PastGamesModal({
  games,
  flipped,
  onClose,
  onLoad,
}: {
  games: PastGameDto[];
  flipped: boolean;
  onClose: () => void;
  onLoad: (index: number) => void;
}) {
  // Последняя партия — сверху (самая свежая интереснее).
  const ordered = [...games].reverse();
  const [sel, setSel] = useState(0);
  // Индекс выбранной партии в исходном массиве games (не в перевёрнутом).
  const originalIndex = games.length - 1 - sel;
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  useEffect(() => setViewIdx(null), [sel]);

  const game = ordered[sel];
  const moves = game?.moves ?? [];
  const start = game?.startFen || STARTING_FEN;
  const viewedFen =
    moves.length === 0
      ? start
      : viewIdx === null
        ? moves[moves.length - 1].fen
        : viewIdx === -1
          ? start
          : moves[viewIdx]?.fen ?? start;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Прошлые партии ученика"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-stone-900/10 dark:bg-stone-900 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-stone-800 dark:text-stone-100">
            Прошлые партии ученика
          </h3>
          <IconButton icon={X} label="Закрыть" onClick={onClose} />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="overflow-hidden rounded-xl ring-1 ring-stone-900/10 dark:ring-white/10">
            <MiniBoard fen={viewedFen} size={300} flipped={flipped} />
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-64">
            <div>
              <FieldLabel>Партия</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {ordered.map((g, i) => (
                  <button
                    key={g.endedAt + ':' + i}
                    type="button"
                    onClick={() => setSel(i)}
                    className={cn(
                      'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-semibold tabular-nums transition-colors duration-150',
                      i === sel
                        ? 'bg-brand-600 text-white'
                        : 'bg-stone-900/[0.05] text-stone-600 hover:bg-stone-900/[0.09] dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]',
                    )}
                    title={`Партия ${ordered.length - i}`}
                  >
                    {ordered.length - i}
                  </button>
                ))}
              </div>
            </div>

            <ToolButton
              icon={DownloadSimple}
              tone="primary"
              size="md"
              onClick={() => onLoad(originalIndex)}
              title="Загрузить выбранную партию на доску ученика"
            >
              Загрузить на доску
            </ToolButton>

            <div className="text-[12px] text-stone-500 dark:text-stone-400">
              Ходов в партии: {moves.length}
            </div>
            {moves.length === 0 ? (
              <div className="rounded-xl bg-stone-900/[0.04] px-3 py-2 text-[12px] text-stone-500 dark:bg-white/[0.05] dark:text-stone-400">
                В этой партии нет ходов.
              </div>
            ) : (
              <MoveNav history={moves} viewIdx={viewIdx} onSelect={setViewIdx} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Маленькие переиспользуемые подкомпоненты для action / nav-row,
// чтобы не дублировать markup между мобильной и десктопной вёрсткой.
// ───────────────────────────────────────────────────────────────

/** Ссылка-приглашение в комнату: сама плашка и есть кнопка «скопировать». */
function LinkCard({
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
      title="Скопировать ссылку на урок"
      className="group flex w-full shrink-0 items-center gap-2 rounded-2xl bg-white/90 px-2.5 py-2 text-left ring-1 ring-stone-900/[0.07] backdrop-blur-sm transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-stone-900/70 dark:ring-white/[0.08] dark:hover:bg-brand-900/30"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-stone-500 dark:text-stone-400">
          {copied ? 'Ссылка скопирована' : 'Ссылка для учеников'}
        </span>
        <span className="block truncate text-[12px] font-semibold text-brand-700 dark:text-brand-300">
          {url}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors duration-150',
          copied
            ? 'bg-brand-600 text-white'
            : 'bg-stone-900/[0.05] text-stone-500 group-hover:bg-brand-600 group-hover:text-white dark:bg-white/[0.07] dark:text-stone-300',
        )}
      >
        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      </span>
    </button>
  );
}

/** Действия учителя, продублированные в пульте под доской на телефоне. */
function ActionButtons({
  isOwner,
  isEditing,
  onEditStart,
  onEditEnd,
  onReset,
  showStudentEditing,
}: {
  isOwner: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onReset: () => void;
  showStudentEditing: boolean;
}) {
  return (
    <>
      {isOwner &&
        (isEditing ? (
          <ToolButton icon={Play} tone="primary" onClick={onEditEnd}>
            Далее
          </ToolButton>
        ) : (
          <ToolButton icon={PencilSimple} tone="primary" onClick={onEditStart}>
            Редактор
          </ToolButton>
        ))}
      {showStudentEditing && (
        <StatusChip tone="amber">
          <PencilSimple size={12} weight="bold" aria-hidden />
          Вы редактируете
        </StatusChip>
      )}
      {isOwner && (
        <ToolButton icon={ArrowCounterClockwise} onClick={onReset} title="Сбросить позицию">
          Сброс
        </ToolButton>
      )}
    </>
  );
}
