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
  type Participant,
  type RoomStatePayload,
  type ChatMessageDto,
  type MatchFoundPayload,
  type TournamentLivePayload,
  type TournamentMatchDto,
  type TournamentStandingDto,
  type RoomMode,
  type MoveHistoryEntry,
  type BoardArrow,
  type BoardMark,
  type ArrowColor,
} from '../src/lib/socket-events';
import {
  forceMove,
  setSideToMove,
  sideToMove as fenSideToMove,
  getPiece,
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

/** socketId -> { userId, timeControl } */
const matchQueue = new Map<string, { userId: string; userName: string; timeControl: string }>();

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
    arrows: room.arrows,
    marks: room.marks,
  };
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
    await prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: m.tournamentId, userId: m.whiteId } },
      data: { score: { increment: whiteScore }, played: { increment: 1 }, isAvailable: true },
    });
    await prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: m.tournamentId, userId: m.blackId } },
      data: { score: { increment: blackScore }, played: { increment: 1 }, isAvailable: true },
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

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;

    socket.on(SocketEvents.RoomJoin, async (code: string) => {
      const runtime = await loadOrCreateRuntime(code);
      if (!runtime) {
        socket.emit(SocketEvents.RoomError, 'Комната не найдена');
        return;
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

    socket.on(SocketEvents.MoveMake, async (move: { from: string; to: string; promotion?: string }) => {
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
        if (runtime.kind === 'tournament' && (runtime.whiteId || runtime.blackId)) {
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
          io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
          await persistFen(code, runtime.fen);

          if (runtime.kind === 'tournament' && runtime.matchId && !runtime.finished) {
            let outcome: 'white' | 'black' | 'draw' | null = null;
            if (game.isCheckmate()) {
              outcome = turn === 'w' ? 'white' : 'black';
            } else if (game.isStalemate() || game.isInsufficientMaterial() || game.isThreefoldRepetition() || game.isDraw()) {
              outcome = 'draw';
            }
            if (outcome) {
              runtime.finished = true;
              io.to(code).emit(SocketEvents.GameOver, { outcome });
              await finishMatch(runtime.matchId, outcome);
            }
          }
        } catch {
          socket.emit(SocketEvents.RoomError, 'Невозможный ход');
        }
        return;
      }

      // ---------- Учебная комната: учитываем режимы ----------
      const { allowIllegal, sideLock } = runtime.mode;
      try {
        const from = move.from as Square;
        const to = move.to as Square;
        const piece = getPiece(runtime.fen, from);
        if (!piece) {
          socket.emit(SocketEvents.RoomError, 'На клетке нет фигуры');
          return;
        }

        let legalApplied = false;
        let san = '';
        let appliedFen = runtime.fen;
        let promotionUsed: string | undefined;

        if (allowIllegal) {
          const promo =
            move.promotion && ['q', 'r', 'b', 'n'].includes(String(move.promotion).toLowerCase())
              ? (String(move.promotion).toLowerCase() as 'q' | 'r' | 'b' | 'n')
              : 'q';
          const forced = forceMove(runtime.fen, from, to, promo);
          if (!forced.piece) {
            socket.emit(SocketEvents.RoomError, 'На клетке нет фигуры');
            return;
          }
          const was = fenSideToMove(runtime.fen);
          appliedFen = setSideToMove(forced.fen, was === 'w' ? 'b' : 'w');
          promotionUsed = forced.promoted ? promo : undefined;
          san = `${move.from}-${move.to}${forced.promoted ? '=' + promo.toUpperCase() : ''}`;
        } else {
          const stm = fenSideToMove(runtime.fen);
          if (stm !== piece[0]) {
            // «Оба» + ещё ни одного хода в текущем сегменте → разрешаем начать любой стороной.
            // Кто пошёл — тот и первый, дальше очередь сама встаёт правильно.
            if (sideLock === null && runtime.history.length === 0) {
              runtime.fen = setSideToMove(runtime.fen, piece[0] as 'w' | 'b');
            } else {
              socket.emit(SocketEvents.RoomError, 'Сейчас не ваш ход');
              return;
            }
          }
          try {
            const game = new Chess(runtime.fen);
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
            const pseudo = applyPseudoLegalMove(runtime.fen, from, to, move.promotion);
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

        runtime.fen = appliedFen;
        runtime.history.push({
          san,
          from: move.from,
          to: move.to,
          fen: runtime.fen,
          promotion: promotionUsed,
          legal: legalApplied,
        });
        runtime.arrows = [];
        runtime.marks = [];

        io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
        await persistFen(code, runtime.fen);
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
      runtime.fen = fen;
      runtime.isEditing = false;
      runtime.editorId = null;
      runtime.segmentStartFen = fen;
      // После выхода из редактора история партии больше не относится к новой
      // позиции — обнуляем, чтобы навигация назад не показывала фантомы.
      runtime.history = [];
      runtime.arrows = [];
      runtime.marks = [];
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
    });

    socket.on(SocketEvents.PositionReset, async () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      runtime.fen = STARTING_FEN;
      runtime.isEditing = false;
      runtime.editorId = null;
      runtime.segmentStartFen = STARTING_FEN;
      runtime.history = [];
      runtime.arrows = [];
      runtime.marks = [];
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      await persistFen(code, runtime.fen);
    });

    socket.on(SocketEvents.ModeSet, (partial: Partial<RoomMode>) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      if (runtime.kind !== 'lesson') return; // турниры/casual игнорируют режимы

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
      if (runtime.ownerId !== userId) return;
      if (runtime.kind !== 'lesson') return;
      if (runtime.isEditing) return;
      if (runtime.history.length === 0) return;
      runtime.history.pop();
      runtime.fen =
        runtime.history.length > 0 ? runtime.history[runtime.history.length - 1].fen : runtime.segmentStartFen;
      runtime.arrows = [];
      runtime.marks = [];
      io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      void persistFen(code, runtime.fen);
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

    socket.on(SocketEvents.AudioForceMuteAll, () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      if (runtime.ownerId !== userId) return;
      runtime.participants.forEach((p) => {
        if (p.userId === userId) return;
        p.forcedMute = true;
        p.micEnabled = false;
        io.to(p.socketId).emit(SocketEvents.AudioForceMute, true);
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

    // ---------- Подписка на лайв-турнир ----------
    socket.on(SocketEvents.TournamentLive, async (id: string) => {
      if (typeof id !== 'string') return;
      socket.join(`tournament:${id}`);
      await broadcastTournament(id);
    });

    socket.on('disconnect', () => {
      matchQueue.delete(socket.id);
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const runtime = rooms.get(code);
      if (!runtime) return;
      runtime.participants.delete(socket.id);
      if (runtime.audioReady.delete(socket.id)) {
        runtime.audioReady.forEach((sid) => io.to(sid).emit('audio:peer-left', socket.id));
      }
      io.to(code).emit(SocketEvents.ParticipantsUpdate, Array.from(runtime.participants.values()));
      if (runtime.editorId && !Array.from(runtime.participants.values()).find((p) => p.userId === runtime.editorId)) {
        runtime.isEditing = false;
        runtime.editorId = null;
        io.to(code).emit(SocketEvents.RoomState, buildState(runtime));
      }
      if (runtime.participants.size === 0 && runtime.kind === 'lesson') {
        rooms.delete(code);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`▶ Chess App ready on http://${hostname}:${port}`);
  });
});
