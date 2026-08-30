import { createServer } from 'node:http';
import { parse } from 'node:url';
import { createHmac } from 'node:crypto';
import next from 'next';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import {
  SocketEvents,
  STARTING_FEN,
  DEFAULT_ROOM_MODE,
  parseTimeControl,
  type Participant,
  type RoomStatePayload,
  type ChatMessageDto,
  type MatchFoundPayload,
  type TournamentLivePayload,
  type TournamentMatchDto,
  type TournamentStandingDto,
  type RoomMode,
  type MoveHistoryEntry,
  type MoveTreeNode,
  type PastGameDto,
  type BoardArrow,
  type BoardMark,
  type ArrowColor,
  type ClockState,
  type DrawOfferState,
  type GameResultState,
  type ClassStatePayload,
  type ClassActiveSessionDto,
} from '../src/lib/socket-events';
import {
  forceMove,
  setSideToMove,
  sideToMove as fenSideToMove,
  getPiece,
  deriveCastlingRights,
  type Square,
} from '../src/lib/fen';
import { applyPseudoLegalMove } from '../src/lib/pseudo-legal';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const hostname = '0.0.0.0';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'chess_token';

const prisma = new PrismaClient();

interface RoomRuntime {
  code: string;
  name: string;
  isPublic: boolean;
  ownerId: string;
  fen: string;
  isEditing: boolean;
  editorId: string | null;
  participants: Map<string, Participant>; // socketId -> Participant
  /** Сокеты, которые нажали «Подключиться» к аудио. Это подмножество participants. */
  audioReady: Set<string>;
  kind: string;
  timeControl: string | null;
  tournamentId: string | null;
  whiteId?: string | null;
  blackId?: string | null;
  matchId?: string | null;
  finished?: boolean;
  /** Настройки тренировочной комнаты (legal/illegal, sideLock, права учеников). */
  mode: RoomMode;
  /** История ходов с момента старта/после reset/после edit-end. */
  history: MoveHistoryEntry[];
  /** FEN начала текущего отрезка (после сброса или выхода из редактора) — для отмены к старту отрезка. */
  segmentStartFen: string;
  /** Стрелки и выделения клеток, синхронизированные между всеми участниками. */
  arrows: BoardArrow[];
  marks: BoardMark[];
  /** «Свежий» отрезок: следующий ход в режиме «оба» может быть сделан любой стороной.
   *  Снова становится true после reset / resetToInitial / editEnd / undo;
   *  превращается в false после первого успешного хода. */
  freshSegment: boolean;
  /** Текущая позиция, на которую смотрит учитель (для синхронизации перемотки с учениками).
   *  null = «следить за текущей позицией» (показываем последний ход / старт). */
  historyViewIdx: number | null;
  /** Дерево ходов (варианты как в Lichess). Только для учебных комнат; для
   *  игровых партий пустое. `history` при этом = активная линия к currentNodeId. */
  moveNodes: MoveTreeNode[];
  /** Кончик активной линии (id узла). null = стартовая позиция отрезка. */
  currentNodeId: string | null;
  /** Узел, который учитель показывает ученикам (перемотка веток). null = за актуальной. */
  historyViewNodeId: string | null;
  /** Снимки прошлых партий на доске (после «начать заново») — для разбора учителем. */
  pastGames: PastGameDto[];
  /** Часы партии (только для турнирных / казуальных партий с timeControl). */
  clock: ClockState | null;
  /** Активное предложение ничьей (только для tournament/casual). */
  drawOffer: DrawOfferState | null;
  /** Итог партии (для tournament/casual после завершения). */
  result: GameResultState | null;
  /** Включён ли движок-соперник на доске ученика (только для student-board).
   *  По умолчанию true. Учитель может выключить кнопкой; флаг сохраняется
   *  на сервере и переживает входы/выходы учителя за доску ученика. */
  engineEnabled: boolean;
  /** Сила движка (Stockfish Skill Level 0..20). Для student-board берётся из
   *  задачи (Task.engineLevel). 20 = полная сила. */
  engineLevel: number;
  /** Цвет «человека» на доске задачи (сторона ученика). Для student-board
   *  берётся из задачи (Task.sideToPlay). Движок играет противоположным цветом.
   *  Используется, чтобы и ученику, и зашедшему учителю нельзя было ходить за
   *  цвет движка. null для прочих комнат. */
  humanColor: 'w' | 'b' | null;
  /** Учитель запретил ученикам ходить на этой доске (трансляция/урок). */
  studentMovesLocked: boolean;
  /** Единственный ученик (userId), которому разрешено ходить при блокировке. */
  allowedMoverUserId: string | null;
  /** Турнир: дедлайн (ms epoch) на один из первых двух полуходов. Кто к этому
   *  моменту не сходил — проигрывает. null = правило не действует (сыграно ≥2 хода
   *  или это не турнирная партия). */
  firstMoveDeadlineAt: number | null;
  /** Снимок «живой» партии ученика на момент, когда учитель начал разбор
   *  (загрузил прошлую партию). Пока не null — идёт разбор: при выходе учителя из
   *  доски позиция ученика восстанавливается из снимка и он продолжает играть с
   *  движком. null = обычный режим (разбор не начат). */
  reviewBackup?: RoomReviewBackup | null;
}

/** Сколько даётся на каждый из первых двух полуходов турнирной партии. */
const FIRST_MOVE_MS = 20_000;

/** Число сделанных полуходов, вычисленное из FEN (надёжно после рестарта сервера). */
function pliesFromFen(fen: string): number {
  const parts = fen.split(' ');
  const stm = parts[1] === 'b' ? 'b' : 'w';
  const fullmove = Number(parts[5]) || 1;
  return (fullmove - 1) * 2 + (stm === 'b' ? 1 : 0);
}

/**
 * Троекратное повторение. chess.js определяет его по СВОЕЙ истории позиций,
 * а в обработчике хода мы каждый раз создаём `new Chess(fen)` без истории —
 * поэтому повторение там не ловится. Здесь переигрываем партию с начала
 * отрезка по сохранённым ходам, чтобы у движка была полная история позиций.
 */
function isThreefoldByHistory(segmentStartFen: string, history: MoveHistoryEntry[]): boolean {
  try {
    const g = new Chess(segmentStartFen);
    for (const h of history) {
      const mv = g.move({ from: h.from, to: h.to, promotion: h.promotion ?? 'q' });
      if (!mv) return false;
    }
    return g.isThreefoldRepetition();
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Дерево ходов (варианты как в Lichess). Только для учебных комнат.
// ─────────────────────────────────────────────────────────────────────────
/** Сколько последних партий ученика храним на доске (для разбора учителем). */
const MAX_PAST_GAMES = 6;
const TREE_KINDS = new Set(['lesson', 'student-board', 'class-demo']);
function isTreeRoom(kind: string): boolean {
  return TREE_KINDS.has(kind);
}

let moveNodeSeq = 0;
function newNodeId(): string {
  moveNodeSeq += 1;
  return `n${Date.now().toString(36)}_${moveNodeSeq.toString(36)}`;
}

function treeNodeById(runtime: RoomRuntime, id: string | null): MoveTreeNode | null {
  if (!id) return null;
  return runtime.moveNodes.find((n) => n.id === id) ?? null;
}

function treeChildren(runtime: RoomRuntime, parentId: string | null): MoveTreeNode[] {
  return runtime.moveNodes.filter((n) => n.parentId === parentId);
}

/** Путь от корня до узла nodeId как плоская история (для runtime.history / доски). */
function treePathTo(runtime: RoomRuntime, nodeId: string | null): MoveHistoryEntry[] {
  const path: MoveHistoryEntry[] = [];
  let cur = treeNodeById(runtime, nodeId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.push({
      san: cur.san,
      from: cur.from,
      to: cur.to,
      fen: cur.fen,
      promotion: cur.promotion,
      legal: cur.legal,
    });
    cur = treeNodeById(runtime, cur.parentId);
  }
  path.reverse();
  return path;
}

/** Обновляет runtime.history = активная линия к currentNodeId. */
function syncActiveLine(runtime: RoomRuntime): void {
  runtime.history = treePathTo(runtime, runtime.currentNodeId);
}

/** Удаляет узел и всё его поддерево из дерева. */
function removeSubtree(runtime: RoomRuntime, nodeId: string): void {
  const toRemove = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of runtime.moveNodes) {
      if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
        toRemove.add(n.id);
        changed = true;
      }
    }
  }
  runtime.moveNodes = runtime.moveNodes.filter((n) => !toRemove.has(n.id));
}

/** Снимок текущей главной линии как «прошлая партия» (для разбора учителем). */
function snapshotPastGame(runtime: RoomRuntime): void {
  if (runtime.history.length === 0) return;
  runtime.pastGames.push({
    startFen: runtime.segmentStartFen,
    moves: runtime.history.map((h) => ({ ...h })),
    endedAt: Date.now(),
  });
  // Ограничиваем память: держим последние 6 партий — самые старые вытесняются.
  if (runtime.pastGames.length > MAX_PAST_GAMES) {
    runtime.pastGames.splice(0, runtime.pastGames.length - MAX_PAST_GAMES);
  }
}

/** Полный сброс дерева (после reset / edit-end / «начать заново»). */
function clearTree(runtime: RoomRuntime): void {
  runtime.moveNodes = [];
  runtime.currentNodeId = null;
  runtime.historyViewNodeId = null;
}

/** Снимок «живой» позиции ученика на момент начала разбора учителем (загрузки
 *  прошлой партии). Нужен, чтобы при выходе учителя вернуть доску ученика ровно
 *  туда, где он остановился, и он продолжил играть с движком. */
interface RoomReviewBackup {
  fen: string;
  segmentStartFen: string;
  history: MoveHistoryEntry[];
  moveNodes: MoveTreeNode[];
  currentNodeId: string | null;
  historyViewNodeId: string | null;
  historyViewIdx: number | null;
  freshSegment: boolean;
  pastGames: PastGameDto[];
  arrows: BoardArrow[];
  marks: BoardMark[];
  engineEnabled: boolean;
}

function snapshotReview(rt: RoomRuntime): RoomReviewBackup {
  return {
    fen: rt.fen,
    segmentStartFen: rt.segmentStartFen,
    history: rt.history.map((h) => ({ ...h })),
    moveNodes: rt.moveNodes.map((n) => ({ ...n })),
    currentNodeId: rt.currentNodeId,
    historyViewNodeId: rt.historyViewNodeId,
    historyViewIdx: rt.historyViewIdx,
    freshSegment: rt.freshSegment,
    pastGames: rt.pastGames.map((g) => ({ ...g, moves: g.moves.map((m) => ({ ...m })) })),
    arrows: rt.arrows.map((a) => ({ ...a })),
    marks: rt.marks.map((m) => ({ ...m })),
    engineEnabled: rt.engineEnabled,
  };
}

function restoreReview(rt: RoomRuntime, b: RoomReviewBackup): void {
  rt.fen = b.fen;
  rt.segmentStartFen = b.segmentStartFen;
  rt.history = b.history.map((h) => ({ ...h }));
  rt.moveNodes = b.moveNodes.map((n) => ({ ...n }));
  rt.currentNodeId = b.currentNodeId;
  rt.historyViewNodeId = b.historyViewNodeId;
  rt.historyViewIdx = b.historyViewIdx;
  rt.freshSegment = b.freshSegment;
  rt.pastGames = b.pastGames.map((g) => ({ ...g, moves: g.moves.map((m) => ({ ...m })) }));
  rt.arrows = b.arrows.map((a) => ({ ...a }));
  rt.marks = b.marks.map((m) => ({ ...m }));
  rt.engineEnabled = b.engineEnabled;
  rt.isEditing = false;
  rt.editorId = null;
}

const ALLOWED_ARROW_COLORS: ArrowColor[] = ['green', 'red', 'blue', 'yellow'];
const SQUARE_RX = /^[a-h][1-8]$/;

function sanitizeArrows(input: unknown): BoardArrow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: BoardArrow[] = [];
  for (const raw of input.slice(0, 32)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const from = typeof r.from === 'string' ? r.from.toLowerCase() : '';
    const to = typeof r.to === 'string' ? r.to.toLowerCase() : '';
    const color = (ALLOWED_ARROW_COLORS as string[]).includes(String(r.color))
      ? (r.color as ArrowColor)
      : 'green';
    if (!SQUARE_RX.test(from) || !SQUARE_RX.test(to) || from === to) continue;
    const key = `${from}->${to}:${color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to, color });
  }
  return out;
}

function sanitizeMarks(input: unknown): BoardMark[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: BoardMark[] = [];
  for (const raw of input.slice(0, 32)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const square = typeof r.square === 'string' ? r.square.toLowerCase() : '';
    const color = (ALLOWED_ARROW_COLORS as string[]).includes(String(r.color))
      ? (r.color as ArrowColor)
      : 'red';
    if (!SQUARE_RX.test(square)) continue;
    const key = `${square}:${color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ square, color });
  }
  return out;
}

const rooms = new Map<string, RoomRuntime>();

/**
 * Отложенное удаление опустевших lesson-комнат. История ходов / дерево живут только
 * в памяти runtime, поэтому мгновенное удаление при уходе последнего участника
 * теряло бы историю при обычном обновлении страницы (короткий disconnect→reconnect).
 * Держим комнату ещё немного и отменяем удаление, если кто-то вернулся.
 */
const roomDeletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ROOM_EMPTY_GRACE_MS = 60_000;

function cancelRoomDeletion(code: string): void {
  const t = roomDeletionTimers.get(code);
  if (t) {
    clearTimeout(t);
    roomDeletionTimers.delete(code);
  }
}

/** socketId -> { userId, timeControl } */
const matchQueue = new Map<string, { userId: string; userName: string; timeControl: string }>();

/** Общий чат турнира (in-memory): tournamentId -> последние сообщения. */
const tournamentChats = new Map<string, ChatMessageDto[]>();
const TOURNAMENT_CHAT_LIMIT = 200;

function parseAuthCookie(cookieHeader: string | undefined): { sub: string; name: string } | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; name: string };
    return payload;
  } catch {
    return null;
  }
}

function buildState(room: RoomRuntime): RoomStatePayload {
  return {
    code: room.code,
    name: room.name,
    isPublic: room.isPublic,
    ownerId: room.ownerId,
    fen: room.fen,
    segmentStartFen: room.segmentStartFen,
    isEditing: room.isEditing,
    editorId: room.editorId,
    participants: Array.from(room.participants.values()),
    kind: room.kind,
    timeControl: room.timeControl,
    mode: room.mode,
    history: room.history,
    moveTree: room.moveNodes,
    currentNodeId: room.currentNodeId,
    pastGames: room.pastGames,
    arrows: room.arrows,
    marks: room.marks,
    freshSegment: room.freshSegment,
    historyViewIdx: room.historyViewIdx,
    historyViewNodeId: room.historyViewNodeId,
    clock: room.clock,
    drawOffer: room.drawOffer,
    whiteId: room.whiteId ?? null,
    blackId: room.blackId ?? null,
    result: room.result,
    engineEnabled: room.engineEnabled,
    engineLevel: room.engineLevel,
    humanColor: room.humanColor ?? null,
    studentMovesLocked: room.studentMovesLocked,
    allowedMoverUserId: room.allowedMoverUserId,
    firstMoveDeadlineAt: room.firstMoveDeadlineAt,
  };
}

/** Создаёт начальное состояние часов для партии с заданным timeControl.
 *  Возвращает null, если timeControl не задан или не распознан. */
function makeClock(timeControl: string | null): ClockState | null {
  const parsed = parseTimeControl(timeControl);
  if (!parsed) return null;
  return {
    initialMs: parsed.initialMs,
    incrementMs: parsed.incrementMs,
    whiteMs: parsed.initialMs,
    blackMs: parsed.initialMs,
    // Оба таймера стоят, пока не сделан первый ход — потом запускается соперник.
    running: null,
    lastTickAt: Date.now(),
  };
}

/** Применяет логику часов после хода: списывает время мовера (если его часы тикали),
 *  начисляет инкремент, передаёт ход сопернику. */
function applyClockOnMove(runtime: RoomRuntime, moverColor: 'w' | 'b'): void {
  if (!runtime.clock) return;
  const c = runtime.clock;
  const now = Date.now();
  if (c.running === moverColor) {
    const elapsed = now - c.lastTickAt;
    if (moverColor === 'w') c.whiteMs = Math.max(0, c.whiteMs - elapsed);
    else c.blackMs = Math.max(0, c.blackMs - elapsed);
  }
  // Инкремент за сделанный ход (стандарт Fischer).
  if (moverColor === 'w') c.whiteMs += c.incrementMs;
  else c.blackMs += c.incrementMs;
  c.running = moverColor === 'w' ? 'b' : 'w';
  c.lastTickAt = now;
}

async function loadOrCreateRuntime(code: string): Promise<RoomRuntime | null> {
  const existing = rooms.get(code);
  if (existing) return existing;

  const dbRoom = await prisma.room.findUnique({
    where: { code },
    include: { match: { select: { id: true, whiteId: true, blackId: true } } },
  });
  if (!dbRoom) return null;

  const initialFen = dbRoom.fen || STARTING_FEN;
  const needsClock = dbRoom.kind === 'tournament' || dbRoom.kind === 'casual';
  // Для доски ученика берём силу движка из задачи, которую раздал учитель
  // (TaskSession уникально связана с этой комнатой через roomId). Иначе — полная сила.
  let engineLevel = 20;
  let humanColor: 'w' | 'b' | null = null;
  if (dbRoom.kind === 'student-board') {
    const ts = await prisma.taskSession.findUnique({
      where: { roomId: dbRoom.id },
      include: { task: { select: { engineLevel: true, sideToPlay: true } } },
    });
    if (ts?.task) {
      engineLevel = ts.task.engineLevel;
      humanColor = ts.task.sideToPlay === 'b' ? 'b' : 'w';
    }
  }
  const runtime: RoomRuntime = {
    code: dbRoom.code,
    name: dbRoom.name,
    isPublic: dbRoom.isPublic,
    ownerId: dbRoom.ownerId,
    fen: initialFen,
    isEditing: false,
    editorId: null,
    participants: new Map(),
    audioReady: new Set(),
    kind: dbRoom.kind,
    timeControl: dbRoom.timeControl,
    tournamentId: dbRoom.tournamentId,
    matchId: dbRoom.match?.id ?? null,
    whiteId: dbRoom.match?.whiteId ?? null,
    blackId: dbRoom.match?.blackId ?? null,
    mode: { ...DEFAULT_ROOM_MODE },
    history: [],
    segmentStartFen: initialFen,
    arrows: [],
    marks: [],
    freshSegment: true,
    historyViewIdx: null,
    moveNodes: [],
    currentNodeId: null,
    historyViewNodeId: null,
    pastGames: [],
    clock: needsClock ? makeClock(dbRoom.timeControl) : null,
    drawOffer: null,
    result: null,
    engineEnabled: true,
    engineLevel,
    humanColor,
    studentMovesLocked: false,
    allowedMoverUserId: null,
    // Турнирная партия, в которой ещё не сыграно 2 полухода → запускаем 20-сек дедлайн
    // на первый/второй ход (на случай реконструкции runtime после рестарта сервера).
    firstMoveDeadlineAt:
      dbRoom.kind === 'tournament' && pliesFromFen(initialFen) < 2
        ? Date.now() + FIRST_MOVE_MS
        : null,
  };
  rooms.set(code, runtime);
  return runtime;
}

async function persistFen(code: string, fen: string): Promise<void> {
  try {
    await prisma.room.update({ where: { code }, data: { fen } });
  } catch (err) {
    console.error('Failed to persist FEN', err);
  }
}

// ============================================================================
// Класс учителя: live-урок, доска-демонстратор, индивидуальные доски учеников.
// ============================================================================

interface ClassRuntime {
  classId: string;
  slug: string;
  ownerId: string;
  /** Идёт ли сейчас живой урок. Если false — никаких lobby/demo, только библиотека задач. */
  lessonActive: boolean;
  /** Код lobby-комнаты (создаётся при старте урока, удаляется при остановке). */
  lobbyRoomCode: string | null;
  /** Раздана какая задача всем? null = ничего пока. */
  currentTaskId: string | null;
  /** Код доски-демонстратора (когда открыта «Моя доска» или идёт трансляция).
   *  null = демо-комнаты нет совсем. */
  demoRoomCode: string | null;
  /** true = ученики тоже видят demoRoomCode (трансляция включена);
   *  false = только учитель видит свою доску («Моя доска» в личном режиме). */
  demoBroadcast: boolean;
  /** Participant в lobby: userId -> { name, role }.
   *  Источник истины о «кто на уроке». */
  lobbyMembers: Map<string, { name: string; role: 'teacher' | 'student' }>;
  /** Кому из учеников уже выдана ТЕКУЩАЯ задача (currentTaskId) в этом уроке.
   *  Нужен, чтобы отличить опоздавшего (его здесь нет → выдать доску автоматически)
   *  от переподключения уже получившего задачу ученика (он здесь есть → не сбрасывать
   *  его прогресс). Очищается при раздаче новой задачи и остановке урока. */
  distributedTo: Set<string>;
  /** Учитель запер дверь: новых учеников на урок не пускаем. */
  joinsClosed: boolean;
  /** Кого пускать при запертой двери: все, кто успел войти, пока было открыто.
   *  Не чистится при выходе ученика — иначе обрыв связи или случайный выход
   *  на главную оставили бы его за дверью до конца урока. */
  admitted: Set<string>;
}

const classRuntimes = new Map<string, ClassRuntime>(); // classId -> runtime

async function loadOrCreateClassRuntime(classId: string): Promise<ClassRuntime | null> {
  const cached = classRuntimes.get(classId);
  if (cached) return cached;
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) return null;
  const rt: ClassRuntime = {
    classId: cls.id,
    slug: cls.slug,
    ownerId: cls.ownerId,
    lessonActive: false,
    lobbyRoomCode: null,
    currentTaskId: null,
    demoRoomCode: null,
    demoBroadcast: false,
    lobbyMembers: new Map(),
    distributedTo: new Set(),
    joinsClosed: false,
    admitted: new Set(),
  };
  classRuntimes.set(classId, rt);
  return rt;
}

/** Класс по коду его lobby-комнаты (обратный поиск для хуков RoomJoin/disconnect). */
function findClassRuntimeByLobbyCode(code: string): ClassRuntime | null {
  for (const rt of classRuntimes.values()) {
    if (rt.lobbyRoomCode === code) return rt;
  }
  return null;
}

/** Класс по коду любой его служебной комнаты урока: lobby или показа. */
function findClassRuntimeByServiceRoom(code: string): ClassRuntime | null {
  for (const rt of classRuntimes.values()) {
    if (rt.lobbyRoomCode === code || rt.demoRoomCode === code) return rt;
  }
  return null;
}

/** Пускать ли этого пользователя в служебные комнаты урока. */
function classDoorAllows(rt: ClassRuntime, userId: string): boolean {
  if (!rt.joinsClosed) return true;
  if (userId === rt.ownerId) return true;
  return rt.admitted.has(userId);
}

/** userId учеников/учителя, реально вошедших в урок = участники lobby-комнаты.
 *  «Домашечники» (открыли страницу класса, но не вошли в урок) сюда НЕ попадают —
 *  ClassAudioProvider с подключением к lobby-комнате у них не смонтирован. */
function lessonPresentUserIds(rt: ClassRuntime): Set<string> {
  const present = new Set<string>();
  const lobbyRt = rt.lobbyRoomCode ? rooms.get(rt.lobbyRoomCode) : null;
  if (lobbyRt) {
    for (const p of lobbyRt.participants.values()) present.add(p.userId);
  }
  return present;
}

async function buildClassState(io: IOServer, rt: ClassRuntime): Promise<ClassStatePayload> {
  void io;
  // Присутствие на уроке считаем по участникам lobby-комнаты, а не по факту
  // открытия страницы класса — иначе «домашечники» ошибочно считаются на уроке.
  const presentUserIds = lessonPresentUserIds(rt);

  // Подтягиваем активные task-sessions в этом классе (если урок идёт).
  const sessions: ClassActiveSessionDto[] = [];
  if (rt.lessonActive && rt.currentTaskId) {
    try {
      const dbSessions = await prisma.taskSession.findMany({
        where: {
          task: { classId: rt.classId },
          taskId: rt.currentTaskId,
          context: 'lesson',
        },
        include: {
          task: { select: { title: true } },
          user: { select: { displayName: true } },
          room: { select: { code: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      for (const s of dbSessions) {
        if (!s.room) continue;
        // Показываем мини-доску только если ученик:
        //  1) реально сейчас в уроке (участник lobby-комнаты) — иначе онлайн врёт;
        //  2) получил ЭТУ задачу в ТЕКУЩЕМ уроке (distributedTo). Это отсекает
        //     «зависшие» сессии учеников из прошлого урока, у которых в БД осталась
        //     старая lesson-сессия по той же задаче.
        if (!presentUserIds.has(s.userId)) continue;
        if (!rt.distributedTo.has(s.userId)) continue;
        sessions.push({
          sessionId: s.id,
          taskId: s.taskId,
          taskTitle: s.task.title,
          roomCode: s.room.code,
          userId: s.userId,
          userName: s.user.displayName,
          fen: s.fen,
          movesPlayed: s.movesPlayed,
          status: s.status,
          online: true,
          updatedAt: s.updatedAt.getTime(),
        });
      }
    } catch (e) {
      console.error('buildClassState: не удалось загрузить сессии урока', e);
    }
  }
  return {
    classId: rt.classId,
    slug: rt.slug,
    lessonActive: rt.lessonActive,
    currentTaskId: rt.currentTaskId,
    demoRoomCode: rt.demoRoomCode,
    demoBroadcast: rt.demoBroadcast,
    lobbyRoomCode: rt.lobbyRoomCode,
    // Ростер — только фактически присутствующие в канале класса.
    lobbyParticipants: Array.from(rt.lobbyMembers.entries())
      .filter(([userId]) => presentUserIds.has(userId))
      .map(([userId, info]) => ({
        userId,
        name: info.name,
        role: info.role,
      })),
    sessions,
    joinsClosed: rt.joinsClosed,
    admittedIds: Array.from(rt.admitted),
  };
}

async function broadcastClass(io: IOServer, rt: ClassRuntime): Promise<void> {
  const state = await buildClassState(io, rt);
  io.to(`class:${rt.slug}`).emit(SocketEvents.ClassState, state);
}

/** После любого изменения позиции на student-board комнате — синхронизируем
 *  TaskSession в БД и пушим обновлённый ClassState учителю (live grid). */
async function syncTaskSessionAfterMove(io: IOServer, runtime: RoomRuntime): Promise<void> {
  if (runtime.kind !== 'student-board') return;
  const session = await prisma.taskSession.findFirst({
    where: { room: { code: runtime.code } },
    include: { task: { include: { class: true } } },
  });
  if (!session) return;
  let status = session.status;
  let solvedAt = session.solvedAt;
  // Авто-детект решения: если цель «мат» и в FEN мат — фиксируем решение.
  if (status === 'active' && session.task.goal === 'mate') {
    try {
      const g = new Chess(runtime.fen);
      if (g.isCheckmate()) {
        status = 'solved';
        solvedAt = new Date();
      }
    } catch {
      // FEN мог быть некорректный (редактор) — игнорируем.
    }
  }
  await prisma.taskSession.update({
    where: { id: session.id },
    data: {
      fen: runtime.fen,
      movesPlayed: runtime.history.length,
      status,
      solvedAt,
    },
  });
  const justSolved = status === 'solved' && session.status !== 'solved';
  if (justSolved) {
    io.to(`class:${session.task.class.slug}`).emit(SocketEvents.TaskSessionSolved, {
      sessionId: session.id,
      userId: session.userId,
      taskId: session.taskId,
    });
  }
  // История домашних заданий: на каждый ход обновляем ходы текущей активной
  // попытки (чтобы учитель мог перелистать партию), при решении — помечаем
  // попытку решённой. Только для домашнего контекста — ходы на урочной доске
  // (даже если задача помечена как домашка) в историю попыток не попадают.
  if (session.context === 'homework') {
    const attempt = await prisma.taskAttempt.findFirst({
      where: { taskId: session.taskId, userId: session.userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
    if (attempt) {
      await prisma.taskAttempt.update({
        where: { id: attempt.id },
        data: {
          moves: JSON.stringify(runtime.history),
          movesPlayed: runtime.history.length,
          ...(justSolved ? { status: 'solved', solvedAt: solvedAt ?? new Date() } : {}),
        },
      });
    }
  }
  const rt = classRuntimes.get(session.task.classId);
  if (rt) void broadcastClass(io, rt);
}

/** Создаёт служебную Room заданного типа в рамках класса. */
async function createClassServiceRoom(
  rt: ClassRuntime,
  kind: 'class-lobby' | 'student-board' | 'class-demo',
  opts: { fen?: string; name?: string; studentId?: string } = {},
): Promise<{ code: string }> {
  const code = await uniqueRoomCode();
  await prisma.room.create({
    data: {
      code,
      name:
        opts.name ??
        (kind === 'class-lobby'
          ? `Класс ${rt.slug} · урок`
          : kind === 'class-demo'
            ? `Класс ${rt.slug} · показ`
            : `Доска ${opts.studentId ?? ''} · ${rt.slug}`),
      isPublic: false,
      ownerId: rt.ownerId,
      kind,
      fen: opts.fen || STARTING_FEN,
    },
  });
  return { code };
}

/**
 * Гарантирует, что у ученика есть личная доска (Room) + TaskSession под задачу.
 *   • нет сессии/комнаты → создаём (первая раздача либо опоздавший ученик);
 *   • сессия есть и resetExisting=true → сбрасываем доску к началу задачи
 *     (повторная раздача учителем «Раздать»);
 *   • сессия есть и resetExisting=false → НЕ трогаем (переподключение ученика —
 *     сохраняем его прогресс).
 */
async function ensureStudentTaskBoard(
  io: IOServer,
  rt: ClassRuntime,
  task: { id: string; fen: string },
  studentId: string,
  resetExisting: boolean,
): Promise<void> {
  const existing = await prisma.taskSession.findUnique({
    where: {
      taskId_userId_context: { taskId: task.id, userId: studentId, context: 'lesson' },
    },
    include: { room: true },
  });
  if (!existing || !existing.room) {
    const { code } = await createClassServiceRoom(rt, 'student-board', {
      fen: task.fen,
      studentId,
    });
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return;
    if (existing) {
      await prisma.taskSession.update({
        where: { id: existing.id },
        data: { roomId: room.id, fen: task.fen, status: 'active', movesPlayed: 0 },
      });
    } else {
      await prisma.taskSession.create({
        data: {
          taskId: task.id,
          userId: studentId,
          context: 'lesson',
          roomId: room.id,
          fen: task.fen,
          status: 'active',
        },
      });
    }
  } else if (resetExisting) {
    await prisma.room.update({ where: { id: existing.roomId! }, data: { fen: task.fen } });
    await prisma.taskSession.update({
      where: { id: existing.id },
      data: { fen: task.fen, status: 'active', movesPlayed: 0 },
    });
    const roomRt = rooms.get(existing.room.code);
    if (roomRt) {
      roomRt.fen = task.fen;
      roomRt.segmentStartFen = task.fen;
      roomRt.history = [];
      clearTree(roomRt);
      roomRt.freshSegment = true;
      roomRt.historyViewIdx = null;
      io.to(existing.room.code).emit(SocketEvents.RoomState, buildState(roomRt));
    }
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

async function uniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = generateRoomCode();
    const ex = await prisma.room.findUnique({ where: { code: c } });
    if (!ex) return c;
  }
  return generateRoomCode() + Date.now().toString(36).slice(-3).toUpperCase();
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsed = parse(req.url || '/', true);
    handle(req, res, parsed);
  });

  const io = new IOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
  });

  io.use((socket, nextFn) => {
    const auth = parseAuthCookie(socket.handshake.headers.cookie);
    if (!auth) {
      return nextFn(new Error('UNAUTHORIZED'));
    }
    socket.data.userId = auth.sub;
    socket.data.userName = auth.name;
    nextFn();
  });

  // Универсальное завершение партии: фиксирует runtime.result, останавливает часы,
  // оповещает участников и (для турнирной партии) обновляет TournamentMatch + очки.
  function endGame(
    runtime: RoomRuntime,
    outcome: 'white' | 'black' | 'draw',
    reason: GameResultState['reason'],
  ): void {
    if (runtime.finished) return;
    runtime.finished = true;
    runtime.result = { outcome, reason };
    if (runtime.clock) runtime.clock.running = null;
    runtime.drawOffer = null;
    io.to(runtime.code).emit(SocketEvents.RoomState, buildState(runtime));
    io.to(runtime.code).emit(SocketEvents.GameOver, { outcome, reason });
    if (runtime.kind === 'tournament' && runtime.matchId) {
      void finishMatch(runtime.matchId, outcome);
    }
  }

  // ---- Турниры: live broadcast по комнатам tournament:<id> ----
  async function broadcastTournament(tournamentId: string): Promise<void> {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: { user: { select: { id: true, displayName: true } } },
        },
        matches: {
          include: {
            white: { select: { id: true, displayName: true } },
            black: { select: { id: true, displayName: true } },
            room: { select: { code: true, fen: true } },
          },
          orderBy: { startedAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!t) return;
    const standings: TournamentStandingDto[] = t.players
      .slice()
      .sort((a, b) => b.score - a.score || b.played - a.played)
      .map((p, i) => ({
        userId: p.userId,
        name: p.user.displayName,
        score: p.score,
        played: p.played,
        rank: i + 1,
        isAvailable: p.isAvailable,
      }));
    const matches: TournamentMatchDto[] = t.matches.map((m) => ({
      id: m.id,
      roomCode: m.room?.code ?? null,
      whiteId: m.whiteId,
      whiteName: m.white.displayName,
      blackId: m.blackId,
      blackName: m.black.displayName,
      status: m.status,
      fen: m.room?.fen ?? undefined,
    }));
    const endsAt = t.status === 'running'
      ? new Date(t.startsAt.getTime() + t.durationMin * 60_000).toISOString()
      : null;
    const payload: TournamentLivePayload = {
      id: t.id,
      status: t.status,
      startsAt: t.startsAt.toISOString(),
      endsAt,
      matches,
      standings,
    };
    io.to(`tournament:${tournamentId}`).emit(SocketEvents.TournamentState, payload);
  }

  // Подбор пары внутри активного турнира.
  async function tryPairInTournament(tournamentId: string): Promise<void> {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t || t.status !== 'running') return;

    const free = await prisma.tournamentPlayer.findMany({
      where: { tournamentId, isAvailable: true },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, displayName: true } } },
    });
    while (free.length >= 2) {
      const a = free.shift()!;
      const b = free.shift()!;
      // Цвет — случайно
      const aWhite = Math.random() < 0.5;
      const whiteId = aWhite ? a.userId : b.userId;
      const blackId = aWhite ? b.userId : a.userId;
      const whiteName = aWhite ? a.user.displayName : b.user.displayName;
      const blackName = aWhite ? b.user.displayName : a.user.displayName;

      const code = await uniqueRoomCode();
      const room = await prisma.room.create({
        data: {
          code,
          name: `${whiteName} vs ${blackName}`,
          isPublic: true,
          ownerId: whiteId,
          kind: 'tournament',
          timeControl: t.timeControl,
          tournamentId: t.id,
        },
      });
      const match = await prisma.tournamentMatch.create({
        data: { tournamentId: t.id, roomId: room.id, whiteId, blackId, status: 'live' },
      });
      await prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: { in: [whiteId, blackId] } },
        data: { isAvailable: false },
      });

      // Уведомляем игроков с открытой страницей подбора (если они там)
      // — а заодно шлём системно через events для тех, кто на /play не сидит:
      // здесь просто шлём всем подключённым сокетам этих пользователей.
      io.sockets.sockets.forEach((s) => {
        const uid = s.data.userId as string | undefined;
        if (!uid) return;
        if (uid === whiteId || uid === blackId) {
          const opp = uid === whiteId ? blackName : whiteName;
          const payload: MatchFoundPayload = {
            code,
            timeControl: t.timeControl,
            opponentName: opp,
          };
          s.emit(SocketEvents.MatchFound, payload);
        }
      });

      // Кэшируем runtime для быстрой обработки
      rooms.set(code, {
        code,
        name: room.name,
        isPublic: true,
        ownerId: whiteId,
        fen: STARTING_FEN,
        segmentStartFen: STARTING_FEN,
        isEditing: false,
        editorId: null,
        participants: new Map(),
        audioReady: new Set(),
        kind: 'tournament',
        timeControl: t.timeControl,
        tournamentId: t.id,
        matchId: match.id,
        whiteId,
        blackId,
        mode: { ...DEFAULT_ROOM_MODE },
        history: [],
        arrows: [],
        marks: [],
        freshSegment: true,
        historyViewIdx: null,
        moveNodes: [],
        currentNodeId: null,
        historyViewNodeId: null,
        pastGames: [],
        clock: makeClock(t.timeControl),
        drawOffer: null,
        result: null,
        engineEnabled: false,
        engineLevel: 20,
        humanColor: null,
        studentMovesLocked: false,
        allowedMoverUserId: null,
        // У белых есть 20 секунд на первый ход с момента создания партии.
        firstMoveDeadlineAt: Date.now() + FIRST_MOVE_MS,
      });
    }
    await broadcastTournament(tournamentId);
  }

  // Завершение партии: обновляем очки и освобождаем игроков.
  async function finishMatch(
    matchId: string,
    status: 'white' | 'black' | 'draw',
  ): Promise<void> {
    const m = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });
    if (!m || m.status !== 'live') return;
    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status, finishedAt: new Date() },
    });
    const whiteScore = status === 'white' ? 1 : status === 'draw' ? 0.5 : 0;
    const blackScore = status === 'black' ? 1 : status === 'draw' ? 0.5 : 0;
    // После завершения партии игрок НЕ возвращается автоматически в подбор —
    // пусть нажмёт «Вернуться в турнир» (POST /join), чтобы снова стать isAvailable.
    await prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: m.tournamentId, userId: m.whiteId } },
      data: { score: { increment: whiteScore }, played: { increment: 1 }, isAvailable: false },
    });
    await prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: m.tournamentId, userId: m.blackId } },
      data: { score: { increment: blackScore }, played: { increment: 1 }, isAvailable: false },
    });
    await broadcastTournament(m.tournamentId);
    await tryPairInTournament(m.tournamentId);
  }

  // Тикер: запускает турниры по времени и завершает их.
  setInterval(async () => {
    try {
      const now = new Date();
      const toStart = await prisma.tournament.findMany({
        where: { status: 'scheduled', startsAt: { lte: now } },
      });
      for (const t of toStart) {
        await prisma.tournament.update({ where: { id: t.id }, data: { status: 'running' } });
        await broadcastTournament(t.id);
        await tryPairInTournament(t.id);
      }
      const running = await prisma.tournament.findMany({ where: { status: 'running' } });
      for (const t of running) {
        const endsAt = new Date(t.startsAt.getTime() + t.durationMin * 60_000);
        if (now >= endsAt) {
          await prisma.tournament.update({ where: { id: t.id }, data: { status: 'finished' } });
          // Все live-матчи объявляем ничьей по тайм-ауту арены.
          const live = await prisma.tournamentMatch.findMany({
            where: { tournamentId: t.id, status: 'live' },
          });
          for (const m of live) {
            await finishMatch(m.id, 'draw');
          }
          await broadcastTournament(t.id);
        } else {
          await tryPairInTournament(t.id);
        }
      }
    } catch (err) {
      console.error('tournament tick error', err);
    }
  }, 5000);

  // Тикер часов: каждые 250 мс пробегаем по всем активным партиям и проверяем флаг.
  // Если часы тикающего цвета истекли — завершаем партию по timeout.
  // Также убираем истёкшие предложения ничьей.
  setInterval(() => {
    const now = Date.now();
    for (const runtime of rooms.values()) {
      if (runtime.finished) continue;
      // Истечение оффера ничьей.
      if (runtime.drawOffer && now > runtime.drawOffer.expiresAt) {
        runtime.drawOffer = null;
        io.to(runtime.code).emit(SocketEvents.RoomState, buildState(runtime));
      }
      // Правило первых двух полуходов (турнир): кто не сходил за 20 секунд — проигрывает.
      if (runtime.firstMoveDeadlineAt !== null) {
        if (pliesFromFen(runtime.fen) >= 2) {
          runtime.firstMoveDeadlineAt = null;
        } else if (now >= runtime.firstMoveDeadlineAt) {
          const stm: 'w' | 'b' = (runtime.fen.split(' ')[1] ?? 'w') === 'b' ? 'b' : 'w';
          const winner: 'white' | 'black' = stm === 'w' ? 'black' : 'white';
          runtime.firstMoveDeadlineAt = null;
          endGame(runtime, winner, 'timeout');
          continue;
        }
      }
      // Тикаем часы.
      const c = runtime.clock;
      if (!c || c.running === null) continue;
      const elapsed = now - c.lastTickAt;
      const sideMs = c.running === 'w' ? c.whiteMs : c.blackMs;
      if (elapsed >= sideMs) {
        if (c.running === 'w') c.whiteMs = 0;
        else c.blackMs = 0;
        const loser = c.running;
        c.running = null;
        c.lastTickAt = now;
        const winner: 'white' | 'black' = loser === 'w' ? 'black' : 'white';
        endGame(runtime, winner, 'timeout');
      }
    }
  }, 250);

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;

    socket.on(SocketEvents.RoomJoin, async (code: string) => {
      const runtime = await loadOrCreateRuntime(code);
      if (!runtime) {
        socket.emit(SocketEvents.RoomError, 'Комната не найдена');
        return;
      }
      // Кто-то вернулся в комнату — отменяем отложенное удаление, чтобы сохранить историю.
      cancelRoomDeletion(code);

      // Запертая дверь класса: на урок пускаем только тех, кто уже был внутри
      // в момент запирания. Проверяем ДО join — иначе ученик успеет получить
      // состояние комнаты и голос соседей. Комната показа закрыта наравне с
      // lobby: её код уходит в ClassState всем подписчикам страницы класса,
      // и без проверки запертый ученик открыл бы трансляцию по прямой ссылке.
      if (runtime.kind === 'class-lobby' || runtime.kind === 'class-demo') {
        const gate = findClassRuntimeByServiceRoom(code);
        if (gate && !classDoorAllows(gate, userId)) {
          socket.emit(SocketEvents.RoomError, 'Учитель закрыл вход на урок');
          return;
        }
      }

      const role: Participant['role'] = runtime.ownerId === userId ? 'teacher' : 'student';
      const participant: Participant = {
        socketId: socket.id,
        userId,
        name: userName,
        role,
        micEnabled: false,
        forcedMute: false,
      };
      runtime.participants.set(socket.id, participant);
      socket.join(code);
      socket.data.roomCode = code;

      socket.emit(SocketEvents.RoomState, buildState(runtime));
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));

      // Вход в урок = присоединение к lobby-комнате класса. Если урок идёт и задача
      // уже роздана, а этому ученику ещё нет — выдаём ему доску (late join), не
      // трогая остальных. И в любом случае обновляем сетку учителя (состав на уроке
      // изменился). «Домашечники» сюда не попадают — они в lobby-комнату не входят.
      if (runtime.kind === 'class-lobby') {
        const lobbyClass = findClassRuntimeByLobbyCode(code);
        if (lobbyClass) {
          // Вошёл, пока дверь открыта — попадает в список допущенных и сможет
          // вернуться, даже если учитель запрёт класс, пока ученик перезагружает
          // страницу или переживает обрыв связи.
          if (role === 'student') lobbyClass.admitted.add(userId);
          if (
            role === 'student' &&
            lobbyClass.lessonActive &&
            lobbyClass.currentTaskId &&
            !lobbyClass.distributedTo.has(userId)
          ) {
            try {
              const task = await prisma.task.findUnique({
                where: { id: lobbyClass.currentTaskId },
              });
              if (task && task.classId === lobbyClass.classId) {
                await ensureStudentTaskBoard(io, lobbyClass, task, userId, true);
                lobbyClass.distributedTo.add(userId);
              }
            } catch (e) {
              console.error('RoomJoin: late-join distribute failed', userId, e);
            }
          }
          void broadcastClass(io, lobbyClass);
        }
      }

      const history = await prisma.message.findMany({
        where: { room: { code } },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { user: { select: { displayName: true } } },
      });
      const dto: ChatMessageDto[] = history.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.user.displayName,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));
      socket.emit(SocketEvents.ChatHistory, dto);
    });

    socket.on(SocketEvents.MoveMake, async (move: { from: string; to: string; promotion?: string; fromNodeId?: string | null }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.isEditing) {
        socket.emit(SocketEvents.RoomError, 'Идёт редактирование позиции');
        return;
      }

      // ---------- Турнирная / casual партия: строго по правилам ----------
      if (runtime.kind === 'tournament' || runtime.kind === 'casual') {
        if (runtime.finished) {
          socket.emit(SocketEvents.RoomError, 'Партия уже окончена');
          return;
        }
        if (runtime.whiteId || runtime.blackId) {
          if (userId !== runtime.whiteId && userId !== runtime.blackId) {
            socket.emit(SocketEvents.RoomError, 'Вы зритель этой партии');
            return;
          }
        }
        try {
          const game = new Chess(runtime.fen);
          const turn = game.turn();
          if (runtime.whiteId && runtime.blackId) {
            const expected = turn === 'w' ? runtime.whiteId : runtime.blackId;
            if (userId !== expected) {
              socket.emit(SocketEvents.RoomError, 'Сейчас не ваш ход');
              return;
            }
          }
          const result = game.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
          if (!result) {
            socket.emit(SocketEvents.RoomError, 'Невозможный ход');
            return;
          }
          runtime.fen = game.fen();
          runtime.history.push({
            san: result.san,
            from: result.from,
            to: result.to,
            fen: runtime.fen,
            promotion: result.promotion,
            legal: true,
          });
          // Любой новый ход «сбрасывает» текущие стрелки/маркеры,
          // чтобы они не накапливались между разными моментами партии.
          runtime.arrows = [];
          runtime.marks = [];
          runtime.freshSegment = false;
          // После хода все возвращаются к актуальной позиции (= history.length - 1).
          runtime.historyViewIdx = null;
          // Часы: списываем время мовера, +инкремент, передаём ход сопернику.
          applyClockOnMove(runtime, turn);
          // Правило первых двух полуходов (турнир): пока сыграно <2 полуходов —
          // у соперника снова 20 секунд на ответный ход; после 2-го хода правило снимается.
          if (runtime.kind === 'tournament') {
            runtime.firstMoveDeadlineAt =
              pliesFromFen(runtime.fen) < 2 ? Date.now() + FIRST_MOVE_MS : null;
          }
          // Любой ход отменяет действующее предложение ничьей.
          runtime.drawOffer = null;
          io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
          await persistFen(code, runtime.fen);

          // Проверяем окончание партии по правилам.
          let outcome: 'white' | 'black' | 'draw' | null = null;
          let reason: GameResultState['reason'] = 'other';
          if (game.isCheckmate()) {
            outcome = turn === 'w' ? 'white' : 'black';
            reason = 'checkmate';
          } else if (game.isStalemate()) {
            outcome = 'draw';
            reason = 'stalemate';
          } else if (game.isInsufficientMaterial()) {
            outcome = 'draw';
            reason = 'insufficient-material';
          } else if (isThreefoldByHistory(runtime.segmentStartFen, runtime.history)) {
            outcome = 'draw';
            reason = 'threefold';
          } else if (game.isDraw()) {
            outcome = 'draw';
            reason = 'fifty-move';
          }
          if (outcome) endGame(runtime, outcome, reason);
        } catch {
          socket.emit(SocketEvents.RoomError, 'Невозможный ход');
        }
        return;
      }

      // ---------- Учебная комната: учитываем режимы ----------
      // Блокировка ходов учеников (например, на трансляции): ходить может
      // только владелец-учитель и явно разрешённый ученик (allowedMoverUserId).
      if (
        runtime.studentMovesLocked &&
        runtime.ownerId !== userId &&
        runtime.allowedMoverUserId !== userId
      ) {
        socket.emit(SocketEvents.RoomError, 'Учитель временно запретил ходы');
        return;
      }
      const { allowIllegal, sideLock } = runtime.mode;
      try {
        // Базовый узел, ОТ которого делается ход. Если клиент прислал fromNodeId
        // (он листал историю и пошёл иначе) — ветвимся от этого узла; иначе играем
        // от «живого» кончика. null = стартовая позиция отрезка.
        const baseNodeId: string | null =
          move.fromNodeId === undefined ? runtime.currentNodeId : move.fromNodeId ?? null;
        const baseNode = treeNodeById(runtime, baseNodeId);
        let posFen = baseNode ? baseNode.fen : runtime.segmentStartFen;
        // «Свежий» выбор стороны действует только у самого старта отрезка.
        const freshHere = baseNodeId === null && runtime.freshSegment;

        const from = move.from as Square;
        const to = move.to as Square;
        const piece = getPiece(posFen, from);
        if (!piece) {
          socket.emit(SocketEvents.RoomError, 'На клетке нет фигуры');
          return;
        }

        let legalApplied = false;
        let san = '';
        let appliedFen = posFen;
        let promotionUsed: string | undefined;

        if (allowIllegal) {
          const promo =
            move.promotion && ['q', 'r', 'b', 'n'].includes(String(move.promotion).toLowerCase())
              ? (String(move.promotion).toLowerCase() as 'q' | 'r' | 'b' | 'n')
              : 'q';
          const forced = forceMove(posFen, from, to, promo);
          if (!forced.piece) {
            socket.emit(SocketEvents.RoomError, 'На клетке нет фигуры');
            return;
          }
          const was = fenSideToMove(posFen);
          appliedFen = setSideToMove(forced.fen, was === 'w' ? 'b' : 'w');
          promotionUsed = forced.promoted ? promo : undefined;
          san = `${move.from}-${move.to}${forced.promoted ? '=' + promo.toUpperCase() : ''}`;
        } else {
          const stm = fenSideToMove(posFen);
          if (stm !== piece[0]) {
            // «Оба» + это первый ход в текущем «свежем» отрезке (после старта/edit/reset/initial/undo)
            // → разрешаем начать любой стороной. Кто пошёл — тот и первый,
            // дальше очередь сама встаёт правильно.
            if (sideLock === null && freshHere) {
              posFen = setSideToMove(posFen, piece[0] as 'w' | 'b');
            } else {
              socket.emit(SocketEvents.RoomError, 'Сейчас не ваш ход');
              return;
            }
          }
          try {
            const game = new Chess(posFen);
            const r = game.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
            if (r) {
              legalApplied = true;
              san = r.san;
              promotionUsed = r.promotion;
              appliedFen = game.fen();
            }
          } catch {
            // позиция не загружается в chess.js или ход отклонён
          }
          if (!legalApplied) {
            const pseudo = applyPseudoLegalMove(posFen, from, to, move.promotion);
            if (!pseudo) {
              socket.emit(SocketEvents.RoomError, 'Невозможный ход');
              return;
            }
            legalApplied = true;
            san = pseudo.san;
            appliedFen = pseudo.fen;
            if (
              move.promotion &&
              ['q', 'r', 'b', 'n'].includes(String(move.promotion).toLowerCase()) &&
              piece[1] === 'p'
            ) {
              promotionUsed = String(move.promotion).toLowerCase();
            }
          }
        }

        if (sideLock) {
          appliedFen = setSideToMove(appliedFen, sideLock);
        }

        // Вставка в дерево ходов. Если из базового узла уже есть точно такой же
        // ход — просто переходим на него (без дубликата). Иначе рождается новый
        // узел: если у базового узла уже были дети — это НОВАЯ ветка (вариант),
        // а прежние линии сохраняются.
        const existingChild = treeChildren(runtime, baseNodeId).find(
          (c) =>
            c.from === move.from &&
            c.to === move.to &&
            (c.promotion ?? '') === (promotionUsed ?? ''),
        );
        if (existingChild) {
          runtime.currentNodeId = existingChild.id;
          runtime.fen = existingChild.fen;
        } else {
          const node: MoveTreeNode = {
            id: newNodeId(),
            parentId: baseNodeId,
            san,
            from: move.from,
            to: move.to,
            fen: appliedFen,
            promotion: promotionUsed,
            legal: legalApplied,
          };
          runtime.moveNodes.push(node);
          runtime.currentNodeId = node.id;
          runtime.fen = appliedFen;
        }
        syncActiveLine(runtime);
        runtime.arrows = [];
        runtime.marks = [];
        // Первый ход «свежего» отрезка сделан — дальше очередь работает строго.
        runtime.freshSegment = false;
        // Любой ход возвращает всех к актуальной позиции.
        runtime.historyViewIdx = null;
        runtime.historyViewNodeId = null;

        io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
        await persistFen(code, runtime.fen);
        void syncTaskSessionAfterMove(io, runtime);
      } catch (err) {
        console.error('move error', err);
        socket.emit(SocketEvents.RoomError, 'Ошибка при выполнении хода');
      }
    });

    socket.on(SocketEvents.EditStart, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.kind === 'tournament' || runtime.kind === 'casual') {
        socket.emit(SocketEvents.RoomError, 'В игровой партии редактор недоступен');
        return;
      }
      if (runtime.ownerId !== userId) {
        socket.emit(SocketEvents.RoomError, 'Только учитель может включать режим редактирования');
        return;
      }
      runtime.isEditing = true;
      runtime.editorId = userId;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    socket.on(SocketEvents.EditUpdate, (fen: string) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime || !runtime.isEditing) return;
      const isOwner = runtime.ownerId === userId;
      // Учитель — всегда; ученики — только если включён режим «ученикам можно редактировать».
      if (!isOwner && !runtime.mode.studentsCanEdit) return;
      if (typeof fen !== 'string' || fen.length < 5 || fen.length > 100) return;
      runtime.fen = fen;
      socket.to(code).emit(SocketEvents.EditUpdate, fen);
    });

    socket.on(SocketEvents.EditEnd, async (fen: string) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      // Закрывать редактор может только учитель — иначе ученики мешали бы друг другу.
      if (runtime.ownerId !== userId) return;
      if (typeof fen !== 'string' || fen.length < 5 || fen.length > 100) return;

      // Без валидации chess.js: позиция может быть без королей или с подобными
      // «учебными» отклонениями. Корректность хода при дальнейшей игре
      // обеспечивается режимом комнаты (legal/illegal).
      // Пересчитываем права на рокировку из расстановки: после редактора
      // 3-е поле FEN могло остаться `-`, из-за чего рокировка была невозможна,
      // хотя король и ладьи стоят на местах.
      runtime.fen = deriveCastlingRights(fen);
      // Если включён sideLock — синхронизируем сторону в FEN, иначе игрок не сможет
      // пойти за заблокированный цвет (сервер откажет «сейчас не ваш ход»).
      if (runtime.mode.sideLock) {
        runtime.fen = setSideToMove(runtime.fen, runtime.mode.sideLock);
      }
      runtime.segmentStartFen = runtime.fen;
      runtime.isEditing = false;
      runtime.editorId = null;
      // После выхода из редактора история партии больше не относится к новой
      // позиции — обнуляем, чтобы навигация назад не показывала фантомы.
      runtime.history = [];
      clearTree(runtime);
      runtime.arrows = [];
      runtime.marks = [];
      runtime.freshSegment = true;
      runtime.historyViewIdx = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
      void syncTaskSessionAfterMove(io, runtime);
    });

    socket.on(SocketEvents.PositionReset, async () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      runtime.fen = STARTING_FEN;
      // Если стоит фиксация стороны — выставляем её в FEN, иначе игрок не сможет
      // пойти за заблокированный цвет после сброса.
      if (runtime.mode.sideLock) {
        runtime.fen = setSideToMove(runtime.fen, runtime.mode.sideLock);
      }
      runtime.isEditing = false;
      runtime.editorId = null;
      runtime.segmentStartFen = runtime.fen;
      runtime.history = [];
      clearTree(runtime);
      runtime.arrows = [];
      runtime.marks = [];
      runtime.freshSegment = true;
      runtime.historyViewIdx = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
    });

    // «Вернуть мою позицию»: возврат к началу текущего сегмента —
    // то есть к позиции, которую учитель выставил в редакторе. Сегмент сохраняется,
    // история ходов очищается, аннотации сбрасываются.
    socket.on(SocketEvents.PositionResetToInitial, async () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (
        runtime.kind !== 'lesson' &&
        runtime.kind !== 'student-board' &&
        runtime.kind !== 'class-demo'
      )
        return;
      // student-board: разрешаем сброс любому участнику комнаты — ученик нажал
      // «Начать заново» у себя на доске задачи, чтобы повторить решение. В
      // остальных типах (lesson/class-demo) распоряжаться позицией может только учитель.
      const isOwner = runtime.ownerId === userId;
      const isParticipant = Array.from(runtime.participants.values()).some(
        (p) => p.userId === userId,
      );
      if (!isOwner && !(runtime.kind === 'student-board' && isParticipant)) return;
      if (runtime.isEditing) return;
      // Перед сбросом сохраняем сыгранную партию — чтобы учитель мог посмотреть,
      // как ученик решал до нажатия «Начать заново».
      snapshotPastGame(runtime);
      runtime.fen = runtime.segmentStartFen;
      // Если sideLock — снова выравниваем сторону FEN под него.
      if (runtime.mode.sideLock) {
        runtime.fen = setSideToMove(runtime.fen, runtime.mode.sideLock);
      }
      runtime.history = [];
      clearTree(runtime);
      runtime.arrows = [];
      runtime.marks = [];
      runtime.freshSegment = true;
      runtime.historyViewIdx = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
    });

    socket.on(SocketEvents.ModeSet, (partial: Partial<RoomMode>) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      if (runtime.kind !== 'lesson' && runtime.kind !== 'student-board' && runtime.kind !== 'class-demo')
        return; // турниры/casual игнорируют режимы

      const prevSideLock = runtime.mode.sideLock;
      const next: RoomMode = { ...runtime.mode };
      if (typeof partial.allowIllegal === 'boolean') next.allowIllegal = partial.allowIllegal;
      if (partial.sideLock === 'w' || partial.sideLock === 'b' || partial.sideLock === null) {
        next.sideLock = partial.sideLock;
      }
      if (typeof partial.studentsCanEdit === 'boolean') next.studentsCanEdit = partial.studentsCanEdit;
      runtime.mode = next;
      // При смене sideLock на конкретный цвет — сразу выставляем эту сторону как ходящую,
      // чтобы выбор «чёрные» означал, что чёрные и НАЧНУТ.
      if (
        next.sideLock &&
        next.sideLock !== prevSideLock &&
        !runtime.isEditing &&
        fenSideToMove(runtime.fen) !== next.sideLock
      ) {
        runtime.fen = setSideToMove(runtime.fen, next.sideLock);
        void persistFen(code, runtime.fen);
      }
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    socket.on(SocketEvents.MoveUndo, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      // Отменять ход разрешено и учителю, и ученикам — в учебной комнате это удобный
      // инструмент совместного разбора. Остаются только базовые проверки безопасности.
      if (runtime.kind !== 'lesson' && runtime.kind !== 'student-board' && runtime.kind !== 'class-demo') return;
      if (runtime.isEditing) return;
      if (!runtime.currentNodeId) return;
      // Отмена = удаляем текущий узел (и его поддерево ветвей), переходим к родителю.
      const undone = treeNodeById(runtime, runtime.currentNodeId);
      const parentId = undone?.parentId ?? null;
      if (undone) removeSubtree(runtime, undone.id);
      runtime.currentNodeId = parentId;
      const parent = treeNodeById(runtime, parentId);
      runtime.fen = parent ? parent.fen : runtime.segmentStartFen;
      // Если стоит фиксация стороны — гарантируем, что после отмены стороной хода
      // снова окажется sideLock (в истории/segmentStartFen она могла быть другой).
      if (runtime.mode.sideLock) {
        runtime.fen = setSideToMove(runtime.fen, runtime.mode.sideLock);
      }
      syncActiveLine(runtime);
      runtime.arrows = [];
      runtime.marks = [];
      // После отмены — снова «свежий» отрезок: в режиме «оба» можно начать любой стороной.
      runtime.freshSegment = true;
      runtime.historyViewIdx = null;
      runtime.historyViewNodeId = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      void persistFen(code, runtime.fen);
      void syncTaskSessionAfterMove(io, runtime);
    });

    // Учитель листает историю — броадкастим позицию всем, чтобы ученики видели то же.
    // Принимаем null (= следить за текущей) или число в диапазоне [-1; history.length-1].
    socket.on(SocketEvents.HistoryView, (idxRaw: number | null) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      // Перемотку урока обычно ведёт владелец. Исключение — доска ученика
      // (student-board): там перемотку транслирует и учитель, и сам ученик
      // (в комнате только они двое), чтобы каждый видел навигацию другого.
      if (runtime.ownerId !== userId && runtime.kind !== 'student-board') return;
      // Перемотка работает во всех учебных комнатах: lesson, классовая трансляция и
      // личная доска ученика (учитель пришёл за доску и листает разбор).
      if (
        runtime.kind !== 'lesson' &&
        runtime.kind !== 'class-demo' &&
        runtime.kind !== 'student-board'
      )
        return;
      let next: number | null;
      if (idxRaw === null || idxRaw === undefined) {
        next = null;
      } else if (typeof idxRaw !== 'number' || !Number.isFinite(idxRaw)) {
        return;
      } else {
        const lastIdx = runtime.history.length - 1;
        const clamped = Math.max(-1, Math.min(lastIdx, Math.floor(idxRaw)));
        // Если учитель доехал до последнего хода — храним null («следим за актуальной»).
        next = clamped >= lastIdx ? null : clamped;
      }
      if (runtime.historyViewIdx === next) return;
      runtime.historyViewIdx = next;
      io.to(code).emit(SocketEvents.HistoryView, runtime.historyViewIdx);
    });

    // Учитель показывает конкретный узел дерева (ветку) — ученики следуют за ним.
    socket.on(SocketEvents.HistoryViewNode, (nodeIdRaw: unknown) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      // На доске ученика перемотку веток ведут оба (учитель и ученик); в
      // остальных учебных комнатах — только владелец.
      if (runtime.ownerId !== userId && runtime.kind !== 'student-board') return;
      if (!isTreeRoom(runtime.kind)) return;
      let next: string | null = null;
      if (typeof nodeIdRaw === 'string') {
        // Узел должен существовать; кончик активной линии => null («за актуальной»).
        const exists = runtime.moveNodes.some((n) => n.id === nodeIdRaw);
        next = exists && nodeIdRaw !== runtime.currentNodeId ? nodeIdRaw : null;
      }
      if (runtime.historyViewNodeId === next) return;
      runtime.historyViewNodeId = next;
      io.to(code).emit(SocketEvents.HistoryViewNode, runtime.historyViewNodeId);
    });

    // Учитель загружает сохранённую прошлую партию обратно на доску ученика.
    socket.on(SocketEvents.LoadPastGame, async (indexRaw: unknown) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      if (!isTreeRoom(runtime.kind)) return;
      if (runtime.isEditing) return;
      const index = typeof indexRaw === 'number' ? Math.floor(indexRaw) : -1;
      const game = runtime.pastGames[index];
      if (!game) return;
      // Начало разбора: один раз запоминаем «живую» позицию ученика (до загрузки),
      // чтобы при выходе учителя вернуть её и ученик продолжил играть с движком.
      if (!runtime.reviewBackup) {
        runtime.reviewBackup = snapshotReview(runtime);
      }
      // На время разбора движок молчит — партию разбирают вручную, без ответных
      // ходов движка (в т.ч. движок НЕ ходит в момент самой загрузки позиции).
      runtime.engineEnabled = false;
      // Сохраняем текущую линию (если в ней есть ходы), чтобы не потерять её.
      snapshotPastGame(runtime);
      // Восстанавливаем партию как активную линию дерева.
      runtime.segmentStartFen = game.startFen;
      clearTree(runtime);
      let parentId: string | null = null;
      for (const mv of game.moves) {
        const node: MoveTreeNode = {
          id: newNodeId(),
          parentId,
          san: mv.san,
          from: mv.from,
          to: mv.to,
          fen: mv.fen,
          promotion: mv.promotion,
          legal: mv.legal,
        };
        runtime.moveNodes.push(node);
        parentId = node.id;
      }
      runtime.currentNodeId = parentId;
      runtime.fen =
        game.moves.length > 0 ? game.moves[game.moves.length - 1].fen : game.startFen;
      if (runtime.mode.sideLock) {
        runtime.fen = setSideToMove(runtime.fen, runtime.mode.sideLock);
      }
      syncActiveLine(runtime);
      runtime.arrows = [];
      runtime.marks = [];
      runtime.freshSegment = game.moves.length === 0;
      runtime.historyViewIdx = null;
      runtime.historyViewNodeId = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
      void syncTaskSessionAfterMove(io, runtime);
    });

    // Учитель переключает движок-соперник на доске ученика. Имеет смысл
    // только для student-board: только в нём ученик автоматически играет
    // против движка. Выключение действует, ПОКА учитель стоит за доской ученика
    // (можно спокойно разобрать позицию, движок не отвечает). Как только учитель
    // уходит — движок снова включается автоматически (см. обработчик disconnect),
    // чтобы ученик продолжил игру.
    socket.on(SocketEvents.EngineToggle, (nextRaw: unknown) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.kind !== 'student-board') return;
      if (runtime.ownerId !== userId) return; // только учитель класса
      const next =
        typeof nextRaw === 'boolean' ? nextRaw : !runtime.engineEnabled;
      if (runtime.engineEnabled === next) return;
      runtime.engineEnabled = next;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    // Учитель запрещает/разрешает ученикам делать ходы на этой доске.
    socket.on(SocketEvents.MovesLock, (payload?: { locked?: boolean }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      if (
        runtime.kind !== 'lesson' &&
        runtime.kind !== 'class-demo' &&
        runtime.kind !== 'student-board'
      )
        return;
      const locked = typeof payload?.locked === 'boolean' ? payload.locked : !runtime.studentMovesLocked;
      runtime.studentMovesLocked = locked;
      // При повторной блокировке снова «никому» — учитель заново выберет ученика.
      if (locked) runtime.allowedMoverUserId = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    // Учитель разрешает ходить только одному ученику (по userId).
    socket.on(SocketEvents.MoveAllow, (payload?: { userId?: string | null }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      const next = typeof payload?.userId === 'string' ? payload.userId : null;
      runtime.allowedMoverUserId = next;
      // Разрешая конкретному ученику, автоматически включаем саму блокировку,
      // иначе «разрешение одному» не имело бы смысла (ходить могли бы все).
      if (next) runtime.studentMovesLocked = true;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    socket.on(SocketEvents.ArrowsUpdate, (payload: { arrows?: unknown; marks?: unknown }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      runtime.arrows = sanitizeArrows(payload?.arrows);
      runtime.marks = sanitizeMarks(payload?.marks);
      // Стрелки рассылаем без буду RoomState — отдельным компактным событием,
      // чтобы не дёргать пересчёт всего UI при каждом движении мыши.
      io.to(code).emit(SocketEvents.ArrowsUpdate, {
        arrows: runtime.arrows,
        marks: runtime.marks,
      });
    });

    // ---------- Чат ----------
    socket.on(SocketEvents.ChatSend, async (content: string) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code || typeof content !== 'string' || !content.trim()) return;
      const trimmed = content.trim().slice(0, 1000);

      const room = await prisma.room.findUnique({ where: { code } });
      if (!room) return;

      const saved = await prisma.message.create({
        data: { content: trimmed, roomId: room.id, userId },
        include: { user: { select: { displayName: true } } },
      });
      const dto: ChatMessageDto = {
        id: saved.id,
        userId: saved.userId,
        userName: saved.user.displayName,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      };
      io.to(code).emit(SocketEvents.ChatNew, dto);
    });

    // Учитель очищает чат комнаты: удаляем историю сообщений и рассылаем пустую.
    socket.on(SocketEvents.ChatClear, async () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return; // только владелец-учитель
      const room = await prisma.room.findUnique({ where: { code } });
      if (!room) return;
      await prisma.message.deleteMany({ where: { roomId: room.id } });
      io.to(code).emit(SocketEvents.ChatHistory, [] as ChatMessageDto[]);
    });

    // ---------- WebRTC сигналинг ----------
    // Клиент перед join() запрашивает актуальный список ICE-серверов.
    // Если задан TURN_SECRET — выдаём собственный coturn с краткоживущими creds.
    // Это безопаснее, чем хардкод username/password в JS-бандле.
    // Креды валидны 1 час, схема — RFC 7635 (use-auth-secret в coturn).
    socket.on(
      'audio:get-ice-servers',
      (cb?: (servers: { urls: string | string[]; username?: string; credential?: string }[]) => void) => {
        if (typeof cb !== 'function') return;
        const turnSecret = process.env.TURN_SECRET;
        const turnHost = process.env.TURN_HOST;
        const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
          { urls: 'stun:stun.l.google.com:19302' },
        ];
        if (turnSecret && turnHost) {
          const ttlSec = 60 * 60; // 1 час
          const expiry = Math.floor(Date.now() / 1000) + ttlSec;
          const username = `${expiry}:${socket.id}`;
          const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
          servers.push(
            { urls: `stun:${turnHost}:3478` },
            { urls: `turn:${turnHost}:3478?transport=udp`, username, credential },
            { urls: `turn:${turnHost}:3478?transport=tcp`, username, credential },
            { urls: `turns:${turnHost}:5349?transport=tcp`, username, credential },
          );
        }
        cb(servers);
      },
    );

    // Клиент нажал «Подключиться» → готов отправлять/принимать звук.
    // Возвращаем ему ТОЛЬКО тех, кто уже в аудио (иначе WebRTC создаст «полудуплекс»).
    // Сообщаем уже подключённым, что появился новый пир (они сами не инициируют).
    socket.on(SocketEvents.AudioReady, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) {
        console.warn('[audio] AudioReady but no roomCode on socket', socket.id);
        return;
      }
      const runtime = rooms.get(code);
      if (!runtime) {
        console.warn('[audio] AudioReady but no runtime for code', code);
        return;
      }
      const others = Array.from(runtime.audioReady).filter((sid) => sid !== socket.id);
      runtime.audioReady.add(socket.id);
      console.log('[audio] AudioReady from', socket.id, 'room=', code, 'returning peers=', others);
      socket.emit('audio:peers', others);
      others.forEach((sid) => io.to(sid).emit('audio:peer-joined', socket.id));
    });

    // Клиент нажал «вых.» — больше не участвует в аудио, но остался в комнате.
    socket.on(SocketEvents.AudioLeave, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.audioReady.delete(socket.id)) {
        runtime.audioReady.forEach((sid) => io.to(sid).emit('audio:peer-left', socket.id));
      }
    });

    socket.on(SocketEvents.AudioOffer, ({ to, sdp }: { to: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(to).emit(SocketEvents.AudioOffer, { from: socket.id, sdp });
    });
    socket.on(SocketEvents.AudioAnswer, ({ to, sdp }: { to: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(to).emit(SocketEvents.AudioAnswer, { from: socket.id, sdp });
    });
    socket.on(SocketEvents.AudioIce, ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
      io.to(to).emit(SocketEvents.AudioIce, { from: socket.id, candidate });
    });

    socket.on(SocketEvents.AudioMicState, (enabled: boolean) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      const p = runtime.participants.get(socket.id);
      if (!p) return;
      if (p.forcedMute) {
        p.micEnabled = false;
      } else {
        p.micEnabled = enabled;
      }
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));
    });

    socket.on(SocketEvents.AudioForceMute, ({ targetSocketId, mute }: { targetSocketId: string; mute: boolean }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      const target = runtime.participants.get(targetSocketId);
      if (!target) return;
      target.forcedMute = mute;
      if (mute) target.micEnabled = false;
      io.to(targetSocketId).emit(SocketEvents.AudioForceMute, mute);
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));
    });

    socket.on(SocketEvents.AudioForceMuteAll, (payload?: { mute?: boolean }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      const mute = typeof payload?.mute === 'boolean' ? payload.mute : true;
      runtime.participants.forEach((p) => {
        if (p.userId === userId) return;
        p.forcedMute = mute;
        if (mute) p.micEnabled = false;
        // На размьют клиент сам включит дорожку (AudioForceMute false → mic on)
        // и пришлёт AudioMicState — тогда micEnabled обновится.
        io.to(p.socketId).emit(SocketEvents.AudioForceMute, mute);
      });
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));
    });

    // ---------- Подбор соперника (быстрая игра) ----------
    socket.on(SocketEvents.MatchSearch, async (timeControl: string) => {
      if (typeof timeControl !== 'string') return;
      // Ищем уже ожидающего на том же контроле (другого игрока)
      let pairWith: { socketId: string; userId: string; userName: string } | null = null;
      for (const [sid, q] of matchQueue.entries()) {
        if (q.timeControl === timeControl && q.userId !== userId) {
          pairWith = { socketId: sid, userId: q.userId, userName: q.userName };
          break;
        }
      }
      if (pairWith) {
        matchQueue.delete(pairWith.socketId);
        // Создаём комнату
        const code = await uniqueRoomCode();
        const aWhite = Math.random() < 0.5;
        const whiteId = aWhite ? userId : pairWith.userId;
        const blackId = aWhite ? pairWith.userId : userId;
        const whiteName = aWhite ? userName : pairWith.userName;
        const blackName = aWhite ? pairWith.userName : userName;
        const room = await prisma.room.create({
          data: {
            code,
            name: `${whiteName} vs ${blackName}`,
            isPublic: false,
            ownerId: whiteId,
            kind: 'casual',
            timeControl,
          },
        });
        rooms.set(code, {
          code,
          name: room.name,
          isPublic: false,
          ownerId: whiteId,
          fen: STARTING_FEN,
          segmentStartFen: STARTING_FEN,
          isEditing: false,
          editorId: null,
          participants: new Map(),
          audioReady: new Set(),
          kind: 'casual',
          timeControl,
          tournamentId: null,
          whiteId,
          blackId,
          mode: { ...DEFAULT_ROOM_MODE },
          history: [],
          arrows: [],
          marks: [],
          freshSegment: true,
          historyViewIdx: null,
          moveNodes: [],
          currentNodeId: null,
          historyViewNodeId: null,
          pastGames: [],
          clock: makeClock(timeControl),
          drawOffer: null,
          result: null,
          engineEnabled: false,
          engineLevel: 20,
          humanColor: null,
          studentMovesLocked: false,
          allowedMoverUserId: null,
          // Правило 20 секунд — только для турнирных партий, casual без него.
          firstMoveDeadlineAt: null,
        });
        const payloadA: MatchFoundPayload = {
          code,
          timeControl,
          opponentName: pairWith.userName,
        };
        const payloadB: MatchFoundPayload = {
          code,
          timeControl,
          opponentName: userName,
        };
        socket.emit(SocketEvents.MatchFound, payloadA);
        io.to(pairWith.socketId).emit(SocketEvents.MatchFound, payloadB);
      } else {
        matchQueue.set(socket.id, { userId, userName, timeControl });
        socket.emit(SocketEvents.MatchSearching);
      }
    });

    socket.on(SocketEvents.MatchCancel, () => {
      matchQueue.delete(socket.id);
    });

    // ---------- Сдача / Ничья ----------
    // Только участник турнирной/casual партии может сдаться или предложить ничью.
    socket.on(SocketEvents.Resign, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.kind !== 'tournament' && runtime.kind !== 'casual') return;
      if (runtime.finished) return;
      if (userId !== runtime.whiteId && userId !== runtime.blackId) return;
      const winner: 'white' | 'black' =
        userId === runtime.whiteId ? 'black' : 'white';
      endGame(runtime, winner, 'resignation');
    });

    // Игрок предлагает ничью. Один активный оффер на партию.
    socket.on(SocketEvents.DrawOffer, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.kind !== 'tournament' && runtime.kind !== 'casual') return;
      if (runtime.finished) return;
      if (userId !== runtime.whiteId && userId !== runtime.blackId) return;
      // Не даём «спамить» предложением.
      if (runtime.drawOffer && runtime.drawOffer.fromUserId === userId) return;
      runtime.drawOffer = {
        fromUserId: userId,
        expiresAt: Date.now() + 15_000, // 15 секунд на ответ
      };
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    socket.on(SocketEvents.DrawAccept, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.kind !== 'tournament' && runtime.kind !== 'casual') return;
      if (runtime.finished) return;
      if (!runtime.drawOffer) return;
      // Принять может только тот, кому предложили (т.е. НЕ автор оффера),
      // и только если он участвует в партии.
      if (userId !== runtime.whiteId && userId !== runtime.blackId) return;
      if (userId === runtime.drawOffer.fromUserId) return;
      if (Date.now() > runtime.drawOffer.expiresAt) {
        runtime.drawOffer = null;
        io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
        return;
      }
      endGame(runtime, 'draw', 'draw-agreement');
    });

    socket.on(SocketEvents.DrawDecline, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (!runtime.drawOffer) return;
      if (userId !== runtime.whiteId && userId !== runtime.blackId) return;
      if (userId === runtime.drawOffer.fromUserId) return;
      runtime.drawOffer = null;
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
    });

    // ---------- Подписка на лайв-турнир ----------
    socket.on(SocketEvents.TournamentLive, async (id: string) => {
      if (typeof id !== 'string') return;
      socket.join(`tournament:${id}`);
      socket.data.tournamentId = id;
      socket.emit(SocketEvents.TournamentChatHistory, tournamentChats.get(id) ?? []);
      await broadcastTournament(id);
    });

    // Общий чат турнира: сообщение видят все подписанные на tournament:<id>.
    socket.on(SocketEvents.TournamentChatSend, (content: string) => {
      const id = socket.data.tournamentId as string | undefined;
      if (!id || typeof content !== 'string' || !content.trim()) return;
      const trimmed = content.trim().slice(0, 1000);
      const dto: ChatMessageDto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        userName,
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const list = tournamentChats.get(id) ?? [];
      list.push(dto);
      if (list.length > TOURNAMENT_CHAT_LIMIT) list.splice(0, list.length - TOURNAMENT_CHAT_LIMIT);
      tournamentChats.set(id, list);
      io.to(`tournament:${id}`).emit(SocketEvents.TournamentChatNew, dto);
    });

    // ---------- КЛАСС: подписка / lifecycle урока / демо / раздача ----------
    socket.on(SocketEvents.ClassSubscribe, async (slug: string) => {
      if (typeof slug !== 'string') return;
      const cls = await prisma.class.findUnique({ where: { slug } });
      if (!cls) return;
      const rt = await loadOrCreateClassRuntime(cls.id);
      if (!rt) return;
      socket.join(`class:${rt.slug}`);
      // Запоминаем, к каким классам этот socket подписан.
      const subs = (socket.data.classSubs as Set<string> | undefined) ?? new Set<string>();
      subs.add(rt.classId);
      socket.data.classSubs = subs;
      // Регистрируем пользователя в lobby (используется для ростера и презенса).
      const isStudent = userId !== rt.ownerId;
      rt.lobbyMembers.set(userId, {
        name: userName,
        role: isStudent ? 'student' : 'teacher',
      });
      // ВАЖНО: здесь задачу НЕ раздаём. Подписка на канал класса — это просто
      // открытие страницы класса (в т.ч. ради домашних заданий), а не вход в урок.
      // Раздача опоздавшему происходит при фактическом входе в урок = присоединении
      // к lobby-комнате (см. обработчик RoomJoin для kind='class-lobby').
      const state = await buildClassState(io, rt);
      socket.emit(SocketEvents.ClassState, state);
      void broadcastClass(io, rt);
    });

    socket.on(SocketEvents.ClassUnsubscribe, async (slug: string) => {
      if (typeof slug !== 'string') return;
      const cls = await prisma.class.findUnique({ where: { slug } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt) return;
      socket.leave(`class:${rt.slug}`);
      const subs = socket.data.classSubs as Set<string> | undefined;
      subs?.delete(rt.classId);
      // Если у юзера не осталось других сокетов в этой подписке — убираем из lobby.
      const stillHere = Array.from(io.sockets.adapter.rooms.get(`class:${rt.slug}`) ?? []).some(
        (sid) => {
          const s = io.sockets.sockets.get(sid);
          return s?.data.userId === userId;
        },
      );
      if (!stillHere) rt.lobbyMembers.delete(userId);
      void broadcastClass(io, rt);
    });

    socket.on(SocketEvents.ClassLessonStart, async () => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = await loadOrCreateClassRuntime(cls.id);
      if (!rt) return;
      if (rt.ownerId !== userId) return; // только учитель
      if (!rt.lobbyRoomCode) {
        const { code } = await createClassServiceRoom(rt, 'class-lobby');
        rt.lobbyRoomCode = code;
      }
      rt.lessonActive = true;
      // Новый урок всегда начинается с открытой двери: замок с прошлого урока
      // молча не пустил бы весь класс.
      rt.joinsClosed = false;
      rt.admitted = new Set();
      void broadcastClass(io, rt);
    });

    socket.on(SocketEvents.ClassLessonStop, async () => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt) return;
      if (rt.ownerId !== userId) return;
      rt.lessonActive = false;
      rt.currentTaskId = null;
      rt.demoRoomCode = null;
      rt.demoBroadcast = false;
      rt.distributedTo = new Set();
      rt.joinsClosed = false;
      rt.admitted = new Set();
      // Урок завершён — стираем историю прошлых партий на всех досках класса.
      try {
        const boards = await prisma.taskSession.findMany({
          where: {
            context: 'lesson',
            roomId: { not: null },
            task: { classId: rt.classId },
          },
          include: { room: true },
        });
        for (const s of boards) {
          if (!s.room) continue;
          const roomRt = rooms.get(s.room.code);
          if (roomRt && roomRt.pastGames.length > 0) {
            roomRt.pastGames = [];
            io.to(s.room.code).emit(SocketEvents.RoomState, buildState(roomRt));
          }
        }
      } catch (e) {
        console.error('ClassLessonStop: clear pastGames failed', e);
      }
      // Lobby room оставляем — он легковесный и пригодится в следующий урок.
      void broadcastClass(io, rt);
    });

    socket.on(SocketEvents.ClassDoorToggle, async (payload: { closed?: boolean } | boolean) => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt || !rt.lessonActive) return;
      if (rt.ownerId !== userId) return;

      const closed =
        typeof payload === 'boolean' ? payload : Boolean(payload?.closed);
      rt.joinsClosed = closed;
      if (closed) {
        // Замок фиксирует текущий состав урока. Берём именно присутствующих в
        // lobby, а не накопленный admitted: если ученик ушёл до запирания,
        // учитель закрывал дверь уже без него.
        rt.admitted = new Set(
          Array.from(lessonPresentUserIds(rt)).filter((uid) => uid !== rt.ownerId),
        );
      } else {
        rt.admitted = new Set();
      }
      void broadcastClass(io, rt);
    });

    socket.on(SocketEvents.ClassDistribute, async (payload: { taskId?: string } | string) => {
      const taskId = typeof payload === 'string' ? payload : payload?.taskId;
      if (!taskId) return;
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt || !rt.lessonActive) return;
      if (rt.ownerId !== userId) return;
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.classId !== cls.id) return;
      rt.currentTaskId = taskId;
      // Новая раздача — сбрасываем список «кому выдано»: сейчас заполним заново
      // присутствующими учениками. Опоздавшие подхватят задачу при входе
      // (см. ClassSubscribe), и тоже попадут в этот набор.
      rt.distributedTo = new Set();
      // Доску получают только ученики, реально вошедшие в урок (участники
      // lobby-комнаты). Кто открыл класс ради домашек — задачу не получает.
      // resetExisting=true — повторная раздача всегда начинает задачу заново.
      const studentIds = Array.from(lessonPresentUserIds(rt)).filter(
        (uid) => uid !== rt.ownerId,
      );
      for (const studentId of studentIds) {
        try {
          await ensureStudentTaskBoard(io, rt, task, studentId, true);
          rt.distributedTo.add(studentId);
        } catch (e) {
          console.error('ClassDistribute: ensureStudentTaskBoard failed', studentId, e);
        }
      }
      void broadcastClass(io, rt);
    });

    /** Учитель: «Транслировать ученикам мою доску» — открыть демо-комнату
     *  и сразу включить трансляцию (ученики увидят её вместо своих задач). */
    socket.on(SocketEvents.ClassDemoStart, async (payload?: { fen?: string }) => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt || !rt.lessonActive) return;
      if (rt.ownerId !== userId) return;
      const fen = (typeof payload === 'object' && payload?.fen) || undefined;
      if (!rt.demoRoomCode) {
        const { code } = await createClassServiceRoom(rt, 'class-demo', { fen });
        rt.demoRoomCode = code;
      } else if (fen) {
        await prisma.room.update({ where: { code: rt.demoRoomCode }, data: { fen } });
        const roomRt = rooms.get(rt.demoRoomCode);
        if (roomRt) {
          roomRt.fen = fen;
          roomRt.segmentStartFen = fen;
          roomRt.history = [];
          clearTree(roomRt);
          roomRt.freshSegment = true;
          io.to(rt.demoRoomCode).emit(SocketEvents.RoomState, buildState(roomRt));
        }
      }
      rt.demoBroadcast = true;
      void broadcastClass(io, rt);
    });

    /** Учитель: «Прекратить трансляцию» — комната демо ОСТАЁТСЯ открытой
     *  (учитель может продолжать работать в «Моей доске»), но ученики возвращаются
     *  к своим задачам.  Полное закрытие — отдельный ClassMyBoardStop ниже. */
    socket.on(SocketEvents.ClassDemoStop, async () => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt) return;
      if (rt.ownerId !== userId) return;
      // По умолчанию закрываем демо полностью — это поведение прежнего ClassDemoStop.
      rt.demoRoomCode = null;
      rt.demoBroadcast = false;
      void broadcastClass(io, rt);
    });

    /** Учитель: открыть «Мою доску» — личный демо-room без трансляции.
     *  Если демо-комнаты ещё нет — поднимаем её и держим в режиме приватности
     *  (демо есть, broadcast=false → ученики её НЕ видят). */
    socket.on(SocketEvents.ClassMyBoardOpen, async (payload?: { fen?: string }) => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt || !rt.lessonActive) return;
      if (rt.ownerId !== userId) return;
      const fen = (typeof payload === 'object' && payload?.fen) || undefined;
      if (!rt.demoRoomCode) {
        const { code } = await createClassServiceRoom(rt, 'class-demo', { fen });
        rt.demoRoomCode = code;
      }
      // Личный режим — снимаем трансляцию, если была.
      rt.demoBroadcast = false;
      void broadcastClass(io, rt);
    });

    /** Учитель: переключить флаг трансляции «как есть» — без открытия/закрытия комнаты.
     *  Используется, чтобы из «Моей доски» одной кнопкой запустить показ ученикам. */
    socket.on(SocketEvents.ClassBroadcastToggle, async (payload?: { on?: boolean }) => {
      const cls = await prisma.class.findUnique({ where: { ownerId: userId } });
      if (!cls) return;
      const rt = classRuntimes.get(cls.id);
      if (!rt || !rt.lessonActive) return;
      if (rt.ownerId !== userId) return;
      if (!rt.demoRoomCode) return;
      const next = typeof payload?.on === 'boolean' ? payload.on : !rt.demoBroadcast;
      rt.demoBroadcast = next;
      void broadcastClass(io, rt);
    });

    socket.on('disconnect', () => {
      matchQueue.delete(socket.id);
      // Очистка class-подписок: если у юзера нет других живых сокетов в подписке — убираем из lobby.
      const subs = socket.data.classSubs as Set<string> | undefined;
      if (subs && subs.size > 0) {
        for (const classId of subs) {
          const rt = classRuntimes.get(classId);
          if (!rt) continue;
          const stillHere = Array.from(io.sockets.adapter.rooms.get(`class:${rt.slug}`) ?? []).some(
            (sid) => {
              if (sid === socket.id) return false;
              const s = io.sockets.sockets.get(sid);
              return s?.data.userId === userId;
            },
          );
          if (!stillHere) rt.lobbyMembers.delete(userId);
          void broadcastClass(io, rt);
        }
      }
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      runtime.participants.delete(socket.id);
      if (runtime.audioReady.delete(socket.id)) {
        runtime.audioReady.forEach((sid) => io.to(sid).emit('audio:peer-left', socket.id));
      }
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));

      // Выход из lobby-комнаты = уход с урока → обновляем сетку учителя, чтобы
      // мини-доска и онлайн-статус ушедшего ученика сразу пропали.
      if (runtime.kind === 'class-lobby') {
        const lobbyClass = findClassRuntimeByLobbyCode(code);
        if (lobbyClass) void broadcastClass(io, lobbyClass);
      }

      // student-board: учитель (владелец) покинул доску ученика.
      if (runtime.kind === 'student-board') {
        const ownerStillHere = Array.from(runtime.participants.values()).some(
          (p) => p.userId === runtime.ownerId,
        );
        if (!ownerStillHere) {
          // Сбрасываем «общую перемотку», чтобы ученик не остался прикреплён к
          // позиции, на которой учитель листал разбор, и мог продолжить играть.
          if (runtime.historyViewNodeId !== null || runtime.historyViewIdx !== null) {
            runtime.historyViewNodeId = null;
            runtime.historyViewIdx = null;
            io.to(code).emit(SocketEvents.HistoryViewNode, null);
            io.to(code).emit(SocketEvents.HistoryView, null);
          }
          if (runtime.reviewBackup) {
            // Учитель разбирал прошлую партию → возвращаем ученику его «живую»
            // позицию (до захода учителя) и включённый движок: он продолжает игру.
            restoreReview(runtime, runtime.reviewBackup);
            runtime.reviewBackup = null;
            io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
            void persistFen(code, runtime.fen);
            void syncTaskSessionAfterMove(io, runtime);
          } else if (!runtime.engineEnabled) {
            // Движок был выключен учителем вручную (без разбора) — включаем обратно.
            runtime.engineEnabled = true;
            io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
          }
        }
      }
      if (runtime.editorId && !Array.from(runtime.participants.values()).find((p) => p.userId === runtime.editorId)) {
        runtime.isEditing = false;
        runtime.editorId = null;
        io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      }
      if (runtime.participants.size === 0 && runtime.kind === 'lesson') {
        // Не удаляем сразу: даём время на реконнект (обновление страницы), иначе
        // теряется история ходов/дерево, которые хранятся только в памяти runtime.
        cancelRoomDeletion(code);
        roomDeletionTimers.set(
          code,
          setTimeout(() => {
            roomDeletionTimers.delete(code);
            const rt = rooms.get(code);
            if (rt && rt.participants.size === 0) rooms.delete(code);
          }, ROOM_EMPTY_GRACE_MS),
        );
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`▶ Chess App ready on http://${hostname}:${port}`);
  });
});
