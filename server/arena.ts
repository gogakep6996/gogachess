// ─────────────────────────────── Арена ───────────────────────────────
//
// Турнир одного формата: отведённое время, непрерывный подбор пар, очки
// с бонусом за серию побед. Живёт в отдельном пространстве имён сокета
// '/arena', потому что трансляцию смотрят и без входа на сайт, а основное
// пространство пускает только авторизованных.
//
// Партии арены не используют модель Room: у них своя модель ArenaGame
// со списком ходов и часами, без дерева вариантов и режима редактирования.
// Правила решает сервер, клиент только показывает.

import type { PrismaClient } from '@prisma/client';
import { Chess } from 'chess.js';
import type { Namespace, Server as IOServer, Socket } from 'socket.io';

import {
  ARENA_DRAW_OFFER_MS,
  ARENA_FIRST_MOVE_MS,
  ARENA_POINTS,
  STARTING_FEN,
  SocketEvents,
  parseTimeControl,
  type ArenaGamePayload,
  type ArenaGameSummaryDto,
  type ArenaPlayerState,
  type ArenaResult,
  type ArenaStandingDto,
  type ArenaStatePayload,
  type ChatMessageDto,
  type ClockState,
  type DrawOfferState,
  type GameResultState,
  type MoveHistoryEntry,
} from '../src/lib/socket-events';
import { parseAuthCookie } from './auth-cookie';

/** Сколько последних результатов показываем квадратиками в таблице. */
const RECENT_LIMIT = 8;
/** Предел истории чата арены в памяти. */
const CHAT_LIMIT = 200;
/** Как часто проверяем часы, дедлайны первого хода и конец арены. */
const TICK_MS = 250;
/** Не чаще этого рассылаем снэпшот из-за ходов в партиях: позиции в списке
 *  трансляций должны освежаться, но перерисовывать таблицу на каждый ход
 *  незачем — она от хода не меняется. */
const SNAPSHOT_THROTTLE_MS = 1000;

// ─────────────────────────── состояние в памяти ───────────────────────────

interface PlayerRt {
  userId: string;
  name: string;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  whiteGames: number;
  blackGames: number;
  lastOpponentId: string | null;
  state: ArenaPlayerState;
  scoredAt: Date | null;
  joinedAt: Date;
  /** Последние результаты, самый свежий первым. Живёт только в памяти. */
  recent: ArenaResult[];
  /** id текущей партии, если играет. */
  gameId: string | null;
  /** Нажал «Паузу» во время партии — уйдёт на паузу, когда она закончится. */
  pauseRequested: boolean;
}

interface GameRt {
  id: string;
  arenaId: string;
  whiteId: string;
  whiteName: string;
  blackId: string;
  blackName: string;
  /** Серии обоих на момент начала партии — «огонёк» рядом с именем. */
  whiteStreak: number;
  blackStreak: number;
  chess: Chess;
  /** Позиция, с которой начали: у турнира со своей позицией это не стандарт. */
  startFen: string;
  moves: MoveHistoryEntry[];
  clock: ClockState;
  drawOffer: DrawOfferState | null;
  status: 'live' | 'white' | 'black' | 'draw' | 'cancelled';
  result: GameResultState | null;
  startedAt: Date;
  /** Когда пошли часы стороны, чья очередь. null — первый ход не сделан. */
  turnStartedAt: Date | null;
}

interface ArenaRt {
  id: string;
  name: string;
  timeControl: string;
  durationMin: number;
  startsAt: Date;
  status: 'scheduled' | 'running' | 'finished';
  ownerId: string;
  accessCode: string | null;
  /** Своя начальная позиция всех партий. null — обычная начальная. */
  startFen: string | null;
  players: Map<string, PlayerRt>;
  games: Map<string, GameRt>;
  chat: ChatMessageDto[];
  /** Есть отложенное обновление снэпшота (ходы в чужих партиях). */
  dirty: boolean;
  /** Про закрытие подбора уже сообщили. Без этого флага «время вышло» могло
   *  не дойти до клиентов: пока идёт последняя партия и никто не ходит,
   *  других поводов для рассылки нет. */
  pairingAnnounced: boolean;
  /** Когда снэпшот рассылали в последний раз. */
  lastBroadcastAt: number;
}

/** Момент, после которого новые пары не создаются. */
function endsAt(rt: ArenaRt): Date {
  return new Date(rt.startsAt.getTime() + rt.durationMin * 60_000);
}

/** Время вышло: начатые партии доигрываются, новых пар нет. */
function pairingClosed(rt: ArenaRt): boolean {
  return Date.now() >= endsAt(rt).getTime();
}

function room(arenaId: string): string {
  return `arena:${arenaId}`;
}

function userRoom(arenaId: string, userId: string): string {
  return `arena:${arenaId}:user:${userId}`;
}

function gameRoom(gameId: string): string {
  return `arena:game:${gameId}`;
}

// ──────────────────────────── правила шахмат ────────────────────────────

/**
 * Может ли сторона в принципе поставить мат имеющимся материалом.
 * Нужно для падения флага: если у соперника нет материала для мата, партия
 * заканчивается ничьёй, а не победой (правило ФИДЕ 6.9, так же на личессе).
 * Одинокий король, король с конём и король со слоном мат поставить не могут.
 */
function canMate(chess: Chess, color: 'w' | 'b'): boolean {
  let minors = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color) continue;
      if (sq.type === 'p' || sq.type === 'r' || sq.type === 'q') return true;
      if (sq.type === 'n' || sq.type === 'b') minors += 1;
    }
  }
  return minors >= 2;
}

/** Итог партии по позиции на доске, если она закончилась сама. */
function outcomeFromPosition(
  chess: Chess,
  moverColor: 'w' | 'b',
): { outcome: 'white' | 'black' | 'draw'; reason: GameResultState['reason'] } | null {
  if (chess.isCheckmate()) {
    return { outcome: moverColor === 'w' ? 'white' : 'black', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { outcome: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) {
    return { outcome: 'draw', reason: 'insufficient-material' };
  }
  if (chess.isThreefoldRepetition()) return { outcome: 'draw', reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { outcome: 'draw', reason: 'fifty-move' };
  return null;
}

// ─────────────────────────────── часы ───────────────────────────────

function initialClock(timeControl: string): ClockState {
  const parsed = parseTimeControl(timeControl) ?? { initialMs: 5 * 60_000, incrementMs: 0 };
  return {
    initialMs: parsed.initialMs,
    incrementMs: parsed.incrementMs,
    whiteMs: parsed.initialMs,
    blackMs: parsed.initialMs,
    // Часы стоят, пока не сделан первый ход.
    running: null,
    lastTickAt: Date.now(),
  };
}

/** Списывает время у сделавшего ход, начисляет прибавку, передаёт часы сопернику. */
function applyClockOnMove(game: GameRt, moverColor: 'w' | 'b'): void {
  const c = game.clock;
  const now = Date.now();
  if (c.running === moverColor) {
    const elapsed = now - c.lastTickAt;
    if (moverColor === 'w') c.whiteMs = Math.max(0, c.whiteMs - elapsed);
    else c.blackMs = Math.max(0, c.blackMs - elapsed);
  }
  if (moverColor === 'w') c.whiteMs += c.incrementMs;
  else c.blackMs += c.incrementMs;
  c.running = moverColor === 'w' ? 'b' : 'w';
  c.lastTickAt = now;
  game.turnStartedAt = new Date(now);
}

/**
 * Дедлайн на первый ход. Своё окно есть у каждой стороны: пока никто не пошёл —
 * от начала партии, после хода белых — от момента этого хода. Отдельная колонка
 * в базе не нужна, значение выводится из партии.
 *
 * В турнире со своей позицией правила нет совсем: 20 секунд хватает на знакомый
 * первый ход, но не на разбор чужой расстановки, и партии отменялись бы у тех,
 * кто добросовестно думает. Вместо отмены там сразу идут часы того, чья очередь
 * (см. startGame): партия всё равно закончится, даже если игрок не пришёл.
 */
function firstMoveDeadline(game: GameRt): number | null {
  if (game.status !== 'live') return null;
  if (game.startFen !== STARTING_FEN) return null;
  if (game.moves.length === 0) return game.startedAt.getTime() + ARENA_FIRST_MOVE_MS;
  if (game.moves.length === 1 && game.turnStartedAt) {
    return game.turnStartedAt.getTime() + ARENA_FIRST_MOVE_MS;
  }
  return null;
}

// ───────────────────────────── регистрация ─────────────────────────────

export function registerArena(io: IOServer, prisma: PrismaClient): void {
  const nsp: Namespace = io.of('/arena');
  const arenas = new Map<string, ArenaRt>();

  function logDb(err: unknown): void {
    console.error('[arena] ошибка записи в базу:', err);
  }

  // ─────────────────────────── загрузка из базы ───────────────────────────

  async function hydrate(id: string): Promise<ArenaRt | null> {
    const row = await prisma.arena.findUnique({
      where: { id },
      include: {
        players: { include: { user: { select: { displayName: true } } } },
        games: {
          orderBy: { startedAt: 'asc' },
          include: {
            white: { select: { displayName: true } },
            black: { select: { displayName: true } },
          },
        },
      },
    });
    if (!row) return null;

    const rt: ArenaRt = {
      id: row.id,
      name: row.name,
      timeControl: row.timeControl,
      durationMin: row.durationMin,
      startsAt: row.startsAt,
      status: row.status === 'running' || row.status === 'finished' ? row.status : 'scheduled',
      ownerId: row.ownerId,
      accessCode: row.accessCode && row.accessCode.trim() ? row.accessCode.trim() : null,
      startFen: row.startFen,
      players: new Map(),
      games: new Map(),
      chat: [],
      dirty: false,
      pairingAnnounced: false,
      lastBroadcastAt: 0,
    };

    for (const p of row.players) {
      rt.players.set(p.userId, {
        userId: p.userId,
        name: p.user.displayName,
        score: p.score,
        wins: p.wins,
        draws: p.draws,
        losses: p.losses,
        streak: p.streak,
        whiteGames: p.whiteGames,
        blackGames: p.blackGames,
        lastOpponentId: p.lastOpponentId,
        state: p.state === 'playing' || p.state === 'paused' ? p.state : 'ready',
        scoredAt: p.scoredAt,
        joinedAt: p.joinedAt,
        recent: [],
        gameId: null,
        pauseRequested: false,
      });
    }

    for (const g of row.games) {
      const moves = parseMoves(g.moves);
      // Партию переигрываем от позиции, с которой турнир начинает партии:
      // для турнира со своей позицией стандартная расстановка не подойдёт.
      const startFen = row.startFen ?? STARTING_FEN;
      const chess = new Chess(startFen);
      let replayOk = true;
      for (const m of moves) {
        try {
          chess.move({ from: m.from, to: m.to, promotion: m.promotion });
        } catch {
          replayOk = false;
          break;
        }
      }
      // Если список ходов почему-то не сходится, доверяем сохранённой позиции.
      if (!replayOk) chess.load(g.fen);

      const status =
        g.status === 'white' || g.status === 'black' || g.status === 'draw' || g.status === 'cancelled'
          ? g.status
          : 'live';
      const parsed = parseTimeControl(row.timeControl) ?? { initialMs: 5 * 60_000, incrementMs: 0 };
      // У своей позиции часы идут с самого начала партии, поэтому после
      // перезапуска их нельзя останавливать из-за пустого списка ходов.
      const running: 'w' | 'b' | null =
        status === 'live' && (moves.length > 0 || startFen !== STARTING_FEN) ? chess.turn() : null;
      const game: GameRt = {
        id: g.id,
        arenaId: row.id,
        whiteId: g.whiteId,
        whiteName: g.white.displayName,
        blackId: g.blackId,
        blackName: g.black.displayName,
        whiteStreak: 0,
        blackStreak: 0,
        chess,
        startFen,
        moves,
        clock: {
          initialMs: parsed.initialMs,
          incrementMs: parsed.incrementMs,
          whiteMs: g.whiteMs,
          blackMs: g.blackMs,
          running,
          // Отсчёт продолжается с момента начала хода: перезапуск сервера
          // не должен возвращать сопернику уже утекшее время.
          lastTickAt: (g.turnStartedAt ?? g.startedAt).getTime(),
        },
        drawOffer: null,
        status,
        result: resultFromStatus(status, g.reason),
        startedAt: g.startedAt,
        turnStartedAt: g.turnStartedAt,
      };
      rt.games.set(g.id, game);

      if (status === 'live') {
        const w = rt.players.get(g.whiteId);
        const b = rt.players.get(g.blackId);
        if (w) {
          w.gameId = g.id;
          w.state = 'playing';
        }
        if (b) {
          b.gameId = g.id;
          b.state = 'playing';
        }
      } else if (status !== 'cancelled') {
        // Восстанавливаем цветные квадратики последних результатов.
        const wRes: ArenaResult = status === 'white' ? 'win' : status === 'draw' ? 'draw' : 'loss';
        const bRes: ArenaResult = status === 'black' ? 'win' : status === 'draw' ? 'draw' : 'loss';
        pushRecent(rt.players.get(g.whiteId), wRes);
        pushRecent(rt.players.get(g.blackId), bRes);
      }
    }

    // Игрок, помеченный в базе как playing, но без живой партии (сервер упал
    // между записями), возвращается в пул, иначе он не получит соперника.
    for (const p of rt.players.values()) {
      if (p.state === 'playing' && !p.gameId) p.state = 'ready';
    }

    arenas.set(rt.id, rt);
    return rt;
  }

  async function getArena(id: string): Promise<ArenaRt | null> {
    return arenas.get(id) ?? (await hydrate(id));
  }

  function parseMoves(raw: string): MoveHistoryEntry[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as MoveHistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  function resultFromStatus(status: GameRt['status'], reason: string | null): GameResultState | null {
    if (status === 'live') return null;
    const outcome: 'white' | 'black' | 'draw' =
      status === 'white' ? 'white' : status === 'black' ? 'black' : 'draw';
    const known: GameResultState['reason'][] = [
      'checkmate',
      'stalemate',
      'resignation',
      'timeout',
      'draw-agreement',
      'insufficient-material',
      'threefold',
      'fifty-move',
      'no-first-move',
    ];
    const r = known.find((k) => k === reason) ?? 'other';
    return { outcome, reason: r };
  }

  function pushRecent(player: PlayerRt | undefined, result: ArenaResult): void {
    if (!player) return;
    player.recent.unshift(result);
    if (player.recent.length > RECENT_LIMIT) player.recent.length = RECENT_LIMIT;
  }

  // ──────────────────────────── таблица и снэпшоты ────────────────────────────

  /**
   * Порядок в таблице: очки, затем число побед, затем кто раньше набрал свой
   * результат. Последний признак важен: он отдаёт верхнюю строку тому, кто
   * сделал ту же работу быстрее.
   */
  function standings(rt: ArenaRt): ArenaStandingDto[] {
    const list = [...rt.players.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aAt = a.scoredAt ? a.scoredAt.getTime() : Number.POSITIVE_INFINITY;
      const bAt = b.scoredAt ? b.scoredAt.getTime() : Number.POSITIVE_INFINITY;
      if (aAt !== bAt) return aAt - bAt;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
    return list.map((p, i) => ({
      userId: p.userId,
      name: p.name,
      rank: i + 1,
      score: p.score,
      wins: p.wins,
      played: p.wins + p.draws + p.losses,
      streak: p.streak,
      state: p.state,
      recent: p.recent,
    }));
  }

  function gameSummary(g: GameRt): ArenaGameSummaryDto {
    return {
      id: g.id,
      whiteId: g.whiteId,
      whiteName: g.whiteName,
      blackId: g.blackId,
      blackName: g.blackName,
      status: g.status,
      fen: g.chess.fen(),
      movesCount: g.moves.length,
    };
  }

  function baseState(rt: ArenaRt): Omit<ArenaStatePayload, 'me'> {
    const games = [...rt.games.values()];
    return {
      id: rt.id,
      name: rt.name,
      timeControl: rt.timeControl,
      durationMin: rt.durationMin,
      status: rt.status,
      startsAt: rt.startsAt.toISOString(),
      endsAt: endsAt(rt).toISOString(),
      pairingClosed: rt.status === 'running' && pairingClosed(rt),
      ownerId: rt.ownerId,
      hasAccessCode: rt.accessCode !== null,
      startFen: rt.startFen,
      standings: standings(rt),
      liveGames: games.filter((g) => g.status === 'live').map(gameSummary),
      finishedGames:
        rt.status === 'finished'
          ? games.filter((g) => g.status !== 'live' && g.status !== 'cancelled').map(gameSummary)
          : [],
    };
  }

  function meState(rt: ArenaRt, userId: string | null): ArenaStatePayload['me'] {
    if (!userId) return null;
    const p = rt.players.get(userId);
    if (!p) return null;
    return {
      state: p.state,
      score: p.score,
      streak: p.streak,
      gameId: p.gameId,
      pauseRequested: p.pauseRequested,
    };
  }

  /** Снэпшот арены расходится персонально: у каждого своё поле «me». */
  async function broadcast(rt: ArenaRt): Promise<void> {
    rt.dirty = false;
    rt.lastBroadcastAt = Date.now();
    const base = baseState(rt);
    const sockets = await nsp.in(room(rt.id)).fetchSockets();
    for (const s of sockets) {
      const uid = (s.data.userId as string | undefined) ?? null;
      s.emit(SocketEvents.ArenaState, { ...base, me: meState(rt, uid) });
    }
  }

  function gamePayload(g: GameRt): ArenaGamePayload {
    return {
      id: g.id,
      arenaId: g.arenaId,
      whiteId: g.whiteId,
      whiteName: g.whiteName,
      blackId: g.blackId,
      blackName: g.blackName,
      whiteStreak: g.whiteStreak,
      blackStreak: g.blackStreak,
      status: g.status,
      result: g.result,
      fen: g.chess.fen(),
      startFen: g.startFen,
      moves: g.moves,
      clock: g.clock,
      drawOffer: g.drawOffer,
      firstMoveDeadlineAt: firstMoveDeadline(g),
    };
  }

  function emitGame(g: GameRt): void {
    nsp.to(gameRoom(g.id)).emit(SocketEvents.ArenaGameState, gamePayload(g));
  }

  // ──────────────────────────── запись в базу ────────────────────────────

  /**
   * Очередь записи по партии. Создание строки и запись ходов идут в базу без
   * ожидания ответа, иначе ход тормозил бы на диске. Но порядок соблюдать
   * обязательно: первый же ход в блице обгонял `create`, и обновление падало
   * с «record to update not found», теряя партию.
   */
  const gameWrites = new Map<string, Promise<unknown>>();

  function queueWrite(gameId: string, run: () => Promise<unknown>): void {
    const prev = gameWrites.get(gameId) ?? Promise.resolve();
    const next = prev.then(run).catch(logDb);
    gameWrites.set(gameId, next);
    void next.then(() => {
      if (gameWrites.get(gameId) === next) gameWrites.delete(gameId);
    });
  }

  function persistGame(g: GameRt): void {
    queueWrite(g.id, () =>
      prisma.arenaGame.update({
        where: { id: g.id },
        data: {
          status: g.status,
          reason: g.result?.reason ?? null,
          fen: g.chess.fen(),
          moves: JSON.stringify(g.moves),
          whiteMs: Math.round(g.clock.whiteMs),
          blackMs: Math.round(g.clock.blackMs),
          turnStartedAt: g.turnStartedAt,
          finishedAt: g.status === 'live' ? null : new Date(),
        },
      }),
    );
  }

  function persistPlayer(rt: ArenaRt, p: PlayerRt): void {
    prisma.arenaPlayer
      .update({
        where: { arenaId_userId: { arenaId: rt.id, userId: p.userId } },
        data: {
          score: p.score,
          wins: p.wins,
          draws: p.draws,
          losses: p.losses,
          streak: p.streak,
          whiteGames: p.whiteGames,
          blackGames: p.blackGames,
          lastOpponentId: p.lastOpponentId,
          state: p.state,
          scoredAt: p.scoredAt,
        },
      })
      .catch(logDb);
  }

  // ───────────────────────────── подбор пар ─────────────────────────────

  /**
   * Пары создаются непрерывно, а не по раундам: соединяем соседей по таблице
   * сверху вниз. Ту же пару подряд не повторяем, пока в пуле есть кто-то ещё.
   * Вызывается сразу после входа игрока и после каждой законченной партии,
   * поэтому новый участник получает соперника почти мгновенно.
   */
  function tryPair(rt: ArenaRt): boolean {
    if (rt.status !== 'running' || pairingClosed(rt)) return false;

    const order = standings(rt);
    const pool = order
      .map((s) => rt.players.get(s.userId))
      .filter((p): p is PlayerRt => !!p && p.state === 'ready');

    let paired = false;
    while (pool.length >= 2) {
      const a = pool.shift();
      if (!a) break;
      let idx = pool.findIndex((p) => p.userId !== a.lastOpponentId);
      // Все свободные — прошлый соперник: повтор лучше простоя.
      if (idx === -1) idx = 0;
      const [b] = pool.splice(idx, 1);
      if (!b) break;
      startGame(rt, a, b);
      paired = true;
    }
    return paired;
  }

  /** Цвета чередуем по разнице сыгранных: за арену выходит примерно поровну. */
  function pickColors(a: PlayerRt, b: PlayerRt): { white: PlayerRt; black: PlayerRt } {
    const balA = a.whiteGames - a.blackGames;
    const balB = b.whiteGames - b.blackGames;
    if (balA !== balB) {
      return balA < balB ? { white: a, black: b } : { white: b, black: a };
    }
    return Math.random() < 0.5 ? { white: a, black: b } : { white: b, black: a };
  }

  function startGame(rt: ArenaRt, a: PlayerRt, b: PlayerRt): void {
    const { white, black } = pickColors(a, b);
    const id = `ag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // Позицию турнира берём из настроек: обычная начальная или своя.
    const startFen = rt.startFen ?? STARTING_FEN;
    const chess = new Chess(startFen);
    const clock = initialClock(rt.timeControl);
    const startedAt = new Date();

    // В турнире со своей позицией правила «20 секунд на первый ход» нет, поэтому
    // часы идут сразу у того, чья очередь: думать над незнакомой расстановкой
    // можно сколько угодно, но за свой счёт. Иначе партия с неявившимся игроком
    // висела бы вечно и не давала турниру подвести итоги.
    const ownPosition = startFen !== STARTING_FEN;
    if (ownPosition) {
      clock.running = chess.turn();
      clock.lastTickAt = startedAt.getTime();
    }

    const game: GameRt = {
      id,
      arenaId: rt.id,
      whiteId: white.userId,
      whiteName: white.name,
      blackId: black.userId,
      blackName: black.name,
      whiteStreak: white.streak,
      blackStreak: black.streak,
      chess,
      startFen,
      moves: [],
      clock,
      drawOffer: null,
      status: 'live',
      result: null,
      startedAt,
      // Момент начала хода нужен, чтобы перезапуск сервера не вернул игроку
      // уже утекшее время: у своей позиции отсчёт стартует вместе с партией.
      turnStartedAt: ownPosition ? startedAt : null,
    };
    rt.games.set(id, game);

    white.state = 'playing';
    white.gameId = id;
    white.whiteGames += 1;
    black.state = 'playing';
    black.gameId = id;
    black.blackGames += 1;

    queueWrite(id, () =>
      prisma.arenaGame.create({
        data: {
          id,
          arenaId: rt.id,
          whiteId: white.userId,
          blackId: black.userId,
          status: 'live',
          fen: chess.fen(),
          moves: '[]',
          whiteMs: clock.whiteMs,
          blackMs: clock.blackMs,
          startedAt: game.startedAt,
          turnStartedAt: game.turnStartedAt,
        },
      }),
    );
    persistPlayer(rt, white);
    persistPlayer(rt, black);

    // Обоих игроков подписываем на партию их собственными сокетами: клиент
    // получает доску сразу, без запроса.
    nsp.in(userRoom(rt.id, white.userId)).socketsJoin(gameRoom(id));
    nsp.in(userRoom(rt.id, black.userId)).socketsJoin(gameRoom(id));
    emitGame(game);
  }

  // ────────────────────────── окончание партии ──────────────────────────

  /** Начисление очков. На серии (2+ победы подряд) победа даёт 4, ничья 2. */
  function applyResult(rt: ArenaRt, p: PlayerRt, result: ArenaResult): void {
    const onStreak = p.streak >= ARENA_POINTS.streakFrom;
    let gained = 0;
    if (result === 'win') {
      gained = onStreak ? ARENA_POINTS.winOnStreak : ARENA_POINTS.win;
      p.wins += 1;
      p.streak += 1;
    } else if (result === 'draw') {
      // Ничья на серии приносит двойные очки и одновременно гасит огонёк.
      gained = onStreak ? ARENA_POINTS.drawOnStreak : ARENA_POINTS.draw;
      p.draws += 1;
      p.streak = 0;
    } else {
      p.losses += 1;
      p.streak = 0;
    }
    if (gained > 0) {
      p.score += gained;
      p.scoredAt = new Date();
    }
    pushRecent(p, result);
  }

  /**
   * Завершает партию: фиксирует результат, начисляет очки, возвращает игроков
   * в пул и тут же ищет им новых соперников.
   *
   * Отменённая партия (не сделан первый ход) в зачёт не идёт: очки и серии
   * не меняются, отсутствующий игрок уходит на паузу.
   */
  function finishGame(
    rt: ArenaRt,
    game: GameRt,
    outcome: 'white' | 'black' | 'draw' | 'cancelled',
    reason: GameResultState['reason'],
    absentUserId?: string,
  ): void {
    if (game.status !== 'live') return;

    game.status = outcome;
    game.result = outcome === 'cancelled' ? null : { outcome, reason };
    game.clock.running = null;
    game.clock.lastTickAt = Date.now();
    game.drawOffer = null;

    const white = rt.players.get(game.whiteId);
    const black = rt.players.get(game.blackId);

    if (outcome !== 'cancelled') {
      if (white) applyResult(rt, white, outcome === 'white' ? 'win' : outcome === 'draw' ? 'draw' : 'loss');
      if (black) applyResult(rt, black, outcome === 'black' ? 'win' : outcome === 'draw' ? 'draw' : 'loss');
    }

    for (const p of [white, black]) {
      if (!p) continue;
      p.gameId = null;
      p.lastOpponentId = p.userId === game.whiteId ? game.blackId : game.whiteId;
      const absent = outcome === 'cancelled' && p.userId === absentUserId;
      p.state = p.pauseRequested || absent ? 'paused' : 'ready';
      p.pauseRequested = false;
      persistPlayer(rt, p);
    }

    persistGame(game);
    emitGame(game);
    nsp.to(gameRoom(game.id)).emit(SocketEvents.ArenaGameOver, {
      gameId: game.id,
      outcome,
      reason,
    });

    tryPair(rt);
    void broadcast(rt);
  }

  // ──────────────────────────── ход в партии ────────────────────────────

  function playerColor(game: GameRt, userId: string): 'w' | 'b' | null {
    if (game.whiteId === userId) return 'w';
    if (game.blackId === userId) return 'b';
    return null;
  }

  function handleMove(
    rt: ArenaRt,
    game: GameRt,
    userId: string,
    from: string,
    to: string,
    promotion: string | undefined,
    socket: Socket,
  ): void {
    if (game.status !== 'live') return;
    const color = playerColor(game, userId);
    if (!color) return;
    if (game.chess.turn() !== color) {
      socket.emit(SocketEvents.ArenaError, 'Сейчас ход соперника');
      return;
    }

    let san: string;
    try {
      const move = game.chess.move({ from, to, promotion });
      san = move.san;
    } catch {
      socket.emit(SocketEvents.ArenaError, 'Так пойти нельзя');
      return;
    }

    game.moves.push({ san, from, to, fen: game.chess.fen(), promotion, legal: true });
    applyClockOnMove(game, color);
    // Свой ход снимает предложение ничьей: соглашаться уже поздно.
    game.drawOffer = null;

    const ended = outcomeFromPosition(game.chess, color);
    if (ended) {
      finishGame(rt, game, ended.outcome, ended.reason);
      return;
    }

    persistGame(game);
    emitGame(game);
    // Позиция видна в списке трансляций — обновим снэпшот, но не сразу.
    rt.dirty = true;
  }

  // ─────────────────────── тикер: часы, дедлайны, конец ───────────────────────

  setInterval(() => {
    const now = Date.now();
    for (const rt of arenas.values()) {
      // Старт арены по расписанию.
      if (rt.status === 'scheduled' && now >= rt.startsAt.getTime()) {
        rt.status = 'running';
        prisma.arena.update({ where: { id: rt.id }, data: { status: 'running' } }).catch(logDb);
        tryPair(rt);
        void broadcast(rt);
      }

      let dirty = false;

      for (const game of rt.games.values()) {
        if (game.status !== 'live') continue;

        // Первый ход не сделан за отведённое время: партия отменяется,
        // в зачёт не идёт, а отсутствующий игрок ставится на паузу.
        const deadline = firstMoveDeadline(game);
        if (deadline !== null && now >= deadline) {
          const absent = game.chess.turn() === 'w' ? game.whiteId : game.blackId;
          finishGame(rt, game, 'cancelled', 'no-first-move', absent);
          continue;
        }

        // Истёкшее предложение ничьей.
        if (game.drawOffer && now > game.drawOffer.expiresAt) {
          game.drawOffer = null;
          emitGame(game);
        }

        // Падение флага. Обрыв связи часы не останавливает — здесь это учтено
        // само собой: время течёт независимо от того, кто на связи.
        const c = game.clock;
        if (c.running === null) continue;
        const left = c.running === 'w' ? c.whiteMs : c.blackMs;
        if (now - c.lastTickAt < left) continue;

        if (c.running === 'w') c.whiteMs = 0;
        else c.blackMs = 0;
        const flagged = c.running;
        const winner: 'w' | 'b' = flagged === 'w' ? 'b' : 'w';
        // Нечем ставить мат — ничья, а не победа по времени.
        if (canMate(game.chess, winner)) {
          finishGame(rt, game, winner === 'w' ? 'white' : 'black', 'timeout');
        } else {
          finishGame(rt, game, 'draw', 'insufficient-material');
        }
      }

      // Время вышло и все партии доиграны — таблица окончательная.
      if (rt.status === 'running' && pairingClosed(rt)) {
        if (!rt.pairingAnnounced) {
          rt.pairingAnnounced = true;
          rt.dirty = true;
        }
        const anyLive = [...rt.games.values()].some((g) => g.status === 'live');
        if (!anyLive) {
          rt.status = 'finished';
          prisma.arena
            .update({ where: { id: rt.id }, data: { status: 'finished', finishedAt: new Date() } })
            .catch(logDb);
          dirty = true;
        }
      }

      if (dirty || (rt.dirty && now - rt.lastBroadcastAt >= SNAPSHOT_THROTTLE_MS)) {
        void broadcast(rt);
      }
    }
  }, TICK_MS);

  /**
   * Турниры создаются, правятся и удаляются через обычные HTTP-роуты, а живут
   * они в памяти этого модуля. Прямого канала между ними нет, поэтому список
   * незакрытых арен переспрашиваем у базы: так новый турнир подхватывается сам,
   * «начать сейчас» срабатывает, а удалённый уходит из памяти.
   */
  async function syncFromDb(): Promise<void> {
    const rows = await prisma.arena.findMany({
      where: { status: { in: ['scheduled', 'running'] } },
      select: {
        id: true,
        name: true,
        startsAt: true,
        durationMin: true,
        accessCode: true,
        status: true,
      },
    });
    const alive = new Set(rows.map((r) => r.id));

    for (const r of rows) {
      const rt = arenas.get(r.id);
      if (!rt) {
        await hydrate(r.id);
        continue;
      }
      // Условия правит создатель, но только до старта.
      if (rt.status === 'scheduled') {
        const changed =
          rt.name !== r.name ||
          rt.startsAt.getTime() !== r.startsAt.getTime() ||
          rt.durationMin !== r.durationMin;
        rt.name = r.name;
        rt.startsAt = r.startsAt;
        rt.durationMin = r.durationMin;
        rt.accessCode = r.accessCode && r.accessCode.trim() ? r.accessCode.trim() : null;
        if (changed) rt.dirty = true;
      }
    }

    for (const [id, rt] of arenas) {
      // Закончившиеся держим в памяти: их страницу ещё смотрят. Удалённые —
      // выкидываем, иначе тикер продолжит вести уже несуществующий турнир.
      if (rt.status !== 'finished' && !alive.has(id)) {
        arenas.delete(id);
        nsp.to(room(id)).emit(SocketEvents.ArenaError, 'Турнир удалён создателем');
      }
    }
  }

  void syncFromDb().catch(logDb);
  setInterval(() => {
    void syncFromDb().catch(logDb);
  }, 2000);

  // ─────────────────────────── обработчики сокета ───────────────────────────

  // В арену пускают и без входа на сайт: трансляцию смотрят все, но играть
  // и писать в чат может только авторизованный.
  nsp.use((socket, nextFn) => {
    const auth = parseAuthCookie(socket.handshake.headers.cookie);
    socket.data.userId = auth?.sub ?? null;
    socket.data.userName = auth?.name ?? null;
    nextFn();
  });

  nsp.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | null;
    const userName = socket.data.userName as string | null;

    socket.on(SocketEvents.ArenaWatch, async (arenaId: unknown) => {
      if (typeof arenaId !== 'string') return;
      const rt = await getArena(arenaId);
      if (!rt) {
        socket.emit(SocketEvents.ArenaError, 'Турнир не найден');
        return;
      }
      socket.data.arenaId = rt.id;
      socket.join(room(rt.id));
      if (userId) socket.join(userRoom(rt.id, userId));

      socket.emit(SocketEvents.ArenaState, { ...baseState(rt), me: meState(rt, userId) });
      socket.emit(SocketEvents.ArenaChatHistory, rt.chat);

      // Играющему сразу отдаём его партию.
      const mine = userId ? rt.players.get(userId)?.gameId : null;
      const game = mine ? rt.games.get(mine) : null;
      if (game) {
        socket.join(gameRoom(game.id));
        socket.emit(SocketEvents.ArenaGameState, gamePayload(game));
      }
    });

    socket.on(SocketEvents.ArenaJoin, async (payload: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId) return;
      if (!userId || !userName) {
        socket.emit(SocketEvents.ArenaError, 'Чтобы играть, войдите на сайт');
        return;
      }
      const rt = await getArena(arenaId);
      if (!rt) return;
      if (rt.status === 'finished') {
        socket.emit(SocketEvents.ArenaError, 'Турнир уже закончился');
        return;
      }

      const existing = rt.players.get(userId);
      if (existing) {
        // Возврат с паузы: снова в пул, соперник придёт сразу.
        existing.pauseRequested = false;
        if (existing.state === 'paused') {
          existing.state = 'ready';
          persistPlayer(rt, existing);
        }
      } else {
        if (rt.accessCode) {
          const code =
            payload && typeof payload === 'object' && 'accessCode' in payload
              ? String((payload as { accessCode?: unknown }).accessCode ?? '')
              : '';
          if (code.trim().toLowerCase() !== rt.accessCode.toLowerCase()) {
            socket.emit(SocketEvents.ArenaError, 'Неверный код доступа');
            return;
          }
        }
        if (pairingClosed(rt) && rt.status === 'running') {
          socket.emit(SocketEvents.ArenaError, 'Время турнира вышло, новых партий уже нет');
          return;
        }
        const joinedAt = new Date();
        rt.players.set(userId, {
          userId,
          name: userName,
          score: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          streak: 0,
          whiteGames: 0,
          blackGames: 0,
          lastOpponentId: null,
          state: 'ready',
          scoredAt: null,
          joinedAt,
          recent: [],
          gameId: null,
          pauseRequested: false,
        });
        await prisma.arenaPlayer
          .create({ data: { arenaId: rt.id, userId, joinedAt } })
          .catch(logDb);
      }

      tryPair(rt);
      void broadcast(rt);
    });

    socket.on(SocketEvents.ArenaPause, async () => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId) return;
      const rt = await getArena(arenaId);
      const p = rt?.players.get(userId);
      if (!rt || !p) return;
      if (p.state === 'playing') {
        // Партию не бросаем: пауза включится, когда она закончится.
        // Повторное нажатие отменяет намерение — человек передумал.
        p.pauseRequested = !p.pauseRequested;
      } else if (p.state === 'ready') {
        p.state = 'paused';
        persistPlayer(rt, p);
      }
      void broadcast(rt);
    });

    socket.on(SocketEvents.ArenaGameWatch, async (gameId: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || typeof gameId !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game) return;

      // Отписываемся от прошлой трансляции, но свою партию не покидаем.
      const myGameId = userId ? rt.players.get(userId)?.gameId : null;
      for (const r of socket.rooms) {
        if (r.startsWith('arena:game:') && r !== gameRoom(gameId) && r !== gameRoom(myGameId ?? '')) {
          socket.leave(r);
        }
      }
      socket.join(gameRoom(gameId));
      socket.emit(SocketEvents.ArenaGameState, gamePayload(game));
    });

    socket.on(SocketEvents.ArenaMove, async (payload: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || !payload || typeof payload !== 'object') return;
      const { gameId, from, to, promotion } = payload as {
        gameId?: unknown;
        from?: unknown;
        to?: unknown;
        promotion?: unknown;
      };
      if (typeof gameId !== 'string' || typeof from !== 'string' || typeof to !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game) return;
      handleMove(
        rt,
        game,
        userId,
        from,
        to,
        typeof promotion === 'string' ? promotion : undefined,
        socket,
      );
    });

    socket.on(SocketEvents.ArenaResign, async (gameId: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || typeof gameId !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game || game.status !== 'live') return;
      const color = playerColor(game, userId);
      if (!color) return;
      finishGame(rt, game, color === 'w' ? 'black' : 'white', 'resignation');
    });

    socket.on(SocketEvents.ArenaDrawOffer, async (gameId: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || typeof gameId !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game || game.status !== 'live') return;
      if (!playerColor(game, userId)) return;
      game.drawOffer = { fromUserId: userId, expiresAt: Date.now() + ARENA_DRAW_OFFER_MS };
      emitGame(game);
    });

    socket.on(SocketEvents.ArenaDrawAccept, async (gameId: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || typeof gameId !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game || game.status !== 'live' || !game.drawOffer) return;
      if (!playerColor(game, userId)) return;
      // Принять может только соперник предложившего.
      if (game.drawOffer.fromUserId === userId) return;
      finishGame(rt, game, 'draw', 'draw-agreement');
    });

    socket.on(SocketEvents.ArenaDrawDecline, async (gameId: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || typeof gameId !== 'string') return;
      const rt = await getArena(arenaId);
      const game = rt?.games.get(gameId);
      if (!rt || !game || !game.drawOffer) return;
      if (!playerColor(game, userId)) return;
      game.drawOffer = null;
      emitGame(game);
    });

    socket.on(SocketEvents.ArenaChatSend, async (content: unknown) => {
      const arenaId = socket.data.arenaId as string | undefined;
      if (!arenaId || !userId || !userName) return;
      if (typeof content !== 'string' || !content.trim()) return;
      const rt = await getArena(arenaId);
      if (!rt) return;
      const dto: ChatMessageDto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        userName,
        content: content.trim().slice(0, 500),
        createdAt: new Date().toISOString(),
      };
      rt.chat.push(dto);
      if (rt.chat.length > CHAT_LIMIT) rt.chat.splice(0, rt.chat.length - CHAT_LIMIT);
      nsp.to(room(rt.id)).emit(SocketEvents.ArenaChatNew, dto);
    });
  });
}
