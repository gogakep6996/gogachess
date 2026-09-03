// Проверка турнира со своей начальной позицией.
// Запуск: npx tsx scripts/arena-fen-smoke.ts (нужен поднятый локальный сервер).
//
// Главное, что проверяем: партии раздаются с заданной позиции, дедлайна первого
// хода нет вовсе, и партия не отменяется, даже если 25 секунд никто не ходит.

import { PrismaClient } from '@prisma/client';
import { Chess } from 'chess.js';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';

import {
  SocketEvents,
  type ArenaGamePayload,
  type ArenaStatePayload,
} from '../src/lib/socket-events';

const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const URL = 'http://localhost:3000';

/** Ладья с королём против одинокого короля: мат в один ход, партия короткая. */
const START_FEN = '7k/8/6K1/8/8/8/8/R7 w - - 0 1';

/** Та же позиция в отражении: начинают чёрные — так тоже можно задать турнир. */
const BLACK_FIRST_FEN = 'r7/8/8/8/8/6k1/8/7K b - - 0 1';

/** Мат в один ход из позиции — считаем сами, чтобы не ошибиться руками. */
function mateInOne(fen: string): { from: string; to: string } {
  const chess = new Chess(fen);
  for (const m of chess.moves({ verbose: true })) {
    const probe = new Chess(fen);
    probe.move({ from: m.from, to: m.to, promotion: 'q' });
    if (probe.isCheckmate()) return { from: m.from, to: m.to };
  }
  throw new Error('в позиции нет мата в один ход');
}

let failures = 0;

function check(ok: boolean, what: string, extra = ''): void {
  if (ok) console.log(`  ok   ${what}`);
  else {
    failures += 1;
    console.log(`  FAIL ${what} ${extra}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Открытые сокеты: без закрытия процесс висит после падения проверки. */
const openClients: Client[] = [];

class Client {
  readonly socket: Socket;
  readonly states: ArenaStatePayload[] = [];
  readonly games: ArenaGamePayload[] = [];

  constructor(arenaId: string, token?: string) {
    openClients.push(this);
    this.socket = io(`${URL}/arena`, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: token ? { cookie: `chess_token=${token}` } : undefined,
    });
    this.socket.on(SocketEvents.ArenaState, (p: ArenaStatePayload) => this.states.push(p));
    this.socket.on(SocketEvents.ArenaGameState, (p: ArenaGamePayload) => this.games.push(p));
    const watch = () => this.socket.emit(SocketEvents.ArenaWatch, arenaId);
    this.socket.on('connect', watch);
    if (this.socket.connected) watch();
  }

  emit(event: string, ...args: unknown[]): void {
    this.socket.emit(event, ...args);
  }

  state(p: (s: ArenaStatePayload) => boolean, label: string, timeoutMs = 8000) {
    return this.wait(this.states, p, label, timeoutMs);
  }

  game(p: (g: ArenaGamePayload) => boolean, label: string, timeoutMs = 8000) {
    return this.wait(this.games, p, label, timeoutMs);
  }

  private async wait<T>(
    log: T[],
    predicate: (p: T) => boolean,
    label: string,
    timeoutMs: number,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = log.length - 1; i >= 0; i--) if (predicate(log[i])) return log[i];
      if (Date.now() > deadline) throw new Error(`таймаут ожидания: ${label}`);
      await sleep(50);
    }
  }

  close(): void {
    this.socket.close();
  }
}

async function ensureUser(login: string, name: string) {
  const user = await prisma.user.upsert({
    where: { email: `${login}@arena.local` },
    update: {},
    create: {
      email: `${login}@arena.local`,
      displayName: name,
      passwordHash: 'not-a-real-hash',
      emailVerifiedAt: new Date(),
    },
    select: { id: true, displayName: true },
  });
  return { id: user.id, name: user.displayName };
}

function token(userId: string, name: string): string {
  return jwt.sign({ sub: userId, name }, SECRET, { expiresIn: '1h' });
}

/**
 * Позиция с ходом чёрных: часы должны пойти у чёрных, а не у белых, и мат
 * чёрными должен быть зачтён им в победу.
 */
async function checkBlackFirst(
  p1: { id: string; name: string },
  p2: { id: string; name: string },
): Promise<void> {
  console.log('\nтурнир с позицией, где начинают чёрные');
  await prisma.arena.deleteMany({ where: { name: 'Проверка хода чёрных' } });

  const arena = await prisma.arena.create({
    data: {
      name: 'Проверка хода чёрных',
      timeControl: 'rapid-10+0',
      durationMin: 20,
      startsAt: new Date(Date.now() + 2000),
      status: 'scheduled',
      startFen: BLACK_FIRST_FEN,
      ownerId: p1.id,
    },
    select: { id: true },
  });

  const c1 = new Client(arena.id, token(p1.id, p1.name));
  const c2 = new Client(arena.id, token(p2.id, p2.name));
  await c1.state((s) => s.id === arena.id, 'снэпшот первому');
  await c2.state((s) => s.id === arena.id, 'снэпшот второму');

  c1.emit(SocketEvents.ArenaJoin, {});
  c2.emit(SocketEvents.ArenaJoin, {});

  const g = await c1.game((x) => x.status === 'live', 'партия начата', 15000);
  check(g.fen === BLACK_FIRST_FEN, 'позиция с ходом чёрных', g.fen);
  check(g.clock.running === 'b', 'часы пошли у чёрных', String(g.clock.running));

  const black = g.blackId === p1.id ? c1 : c2;
  black.emit(SocketEvents.ArenaMove, { gameId: g.id, ...mateInOne(BLACK_FIRST_FEN) });

  const over = await black.game((x) => x.id === g.id && x.status !== 'live', 'партия закончена');
  check(over.status === 'black', 'победа чёрных', over.status);
  check(over.result?.reason === 'checkmate', 'причина — мат', String(over.result?.reason));

  await c1.state(
    (s) => s.standings.some((r) => r.userId === g.blackId && r.score === 2),
    'чёрным начислено 2 очка',
  );

  await prisma.arena.delete({ where: { id: arena.id } });
}

async function main(): Promise<void> {
  const p1 = await ensureUser('fen-bot-1', 'ФЕН Первый');
  const p2 = await ensureUser('fen-bot-2', 'ФЕН Второй');

  // Убираем арены прошлых прогонов: иначе недоигранная партия будет висеть.
  await prisma.arena.deleteMany({ where: { name: 'Проверка своей позиции' } });

  const arena = await prisma.arena.create({
    data: {
      name: 'Проверка своей позиции',
      timeControl: 'rapid-10+0',
      durationMin: 20,
      startsAt: new Date(Date.now() + 3000),
      status: 'scheduled',
      startFen: START_FEN,
      ownerId: p1.id,
    },
    select: { id: true },
  });
  console.log(`арена ${arena.id}\n`);

  const c1 = new Client(arena.id, token(p1.id, p1.name));
  const c2 = new Client(arena.id, token(p2.id, p2.name));

  await c1.state((s) => s.id === arena.id, 'снэпшот первому');
  await c2.state((s) => s.id === arena.id, 'снэпшот второму');

  const snapshot = c1.states[c1.states.length - 1];
  check(snapshot.startFen === START_FEN, 'своя позиция приходит клиенту', String(snapshot.startFen));

  console.log('\nвход и подбор пары');
  c1.emit(SocketEvents.ArenaJoin, {});
  c2.emit(SocketEvents.ArenaJoin, {});

  const g1 = await c1.game((g) => g.status === 'live', 'партия у первого', 15000);
  await c2.game((g) => g.id === g1.id, 'партия у второго', 15000);

  check(g1.startFen === START_FEN, 'партия начата с заданной позиции', g1.startFen);
  check(g1.fen === START_FEN, 'позиция на доске — заданная', g1.fen);
  check(g1.firstMoveDeadlineAt === null, 'дедлайна первого хода нет', String(g1.firstMoveDeadlineAt));
  check(g1.moves.length === 0, 'ходов пока нет');
  check(g1.clock.running === 'w', 'часы идут у того, чей ход', String(g1.clock.running));

  console.log('\nждём 25 секунд без ходов: правило 20 секунд не должно срабатывать');
  await sleep(25_000);
  const still = c1.games[c1.games.length - 1];
  check(still.status === 'live', 'партия жива через 25 секунд', still.status);
  // Часы идут вместо отмены партии: отсчёт у белых начался вместе с партией.
  check(still.clock.running === 'w', 'часы всё ещё у белых', String(still.clock.running));
  check(
    Date.now() - still.clock.lastTickAt > 20_000,
    'отсчёт идёт от начала партии',
    `${Math.round((Date.now() - still.clock.lastTickAt) / 1000)} с`,
  );
  const stateNow = c1.states[c1.states.length - 1];
  check(
    stateNow.liveGames.some((g) => g.id === g1.id),
    'партия всё ещё в списке идущих',
  );

  console.log('\nмат в один ход из заданной позиции');
  const white = g1.whiteId === p1.id ? c1 : c2;
  white.emit(SocketEvents.ArenaMove, { gameId: g1.id, ...mateInOne(START_FEN) });

  const over = await white.game((g) => g.id === g1.id && g.status !== 'live', 'партия закончена');
  check(over.status === 'white', 'победа белых', over.status);
  check(over.result?.reason === 'checkmate', 'причина — мат', String(over.result?.reason));
  // Раздумье над позицией оплачено из своих часов, а не прощено.
  check(
    over.clock.whiteMs < over.clock.initialMs - 20_000,
    'время за раздумье списано с белых',
    `осталось ${Math.round(over.clock.whiteMs / 1000)} с из ${Math.round(over.clock.initialMs / 1000)}`,
  );

  const winnerId = g1.whiteId;
  const standing = await c1.state(
    (s) => s.standings.some((r) => r.userId === winnerId && r.score === 2),
    'победителю начислено 2 очка',
  );
  const row = standing.standings.find((r) => r.userId === winnerId);
  check(row?.wins === 1, 'победа учтена', JSON.stringify(row));

  // Запись в базу идёт очередью, а событие клиенту уходит сразу: дожидаемся,
  // иначе проверка читает строку до того, как обновление доехало.
  let saved: { fen: string; moves: string | null; status: string } | null = null;
  for (const _ of Array(40)) {
    saved = await prisma.arenaGame.findUnique({
      where: { id: g1.id },
      select: { fen: true, moves: true, status: true },
    });
    if (saved && saved.status !== 'live') break;
    await sleep(100);
  }
  check(saved?.status === 'white', 'результат в базе', String(saved?.status));
  check(
    typeof saved?.moves === 'string' && JSON.parse(saved.moves).length === 1,
    'ход сохранён в базе',
    String(saved?.moves),
  );

  await prisma.arena.delete({ where: { id: arena.id } });

  await checkBlackFirst(p1, p2);

  console.log(failures === 0 ? '\nвсё сошлось' : `\nпровалов: ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const c of openClients) c.close();
    await prisma.$disconnect();
  });
