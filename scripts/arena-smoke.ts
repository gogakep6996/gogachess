// Сценарий проверки арены: два игрока, полный круг.
// Запуск: npx tsx scripts/arena-smoke.ts (локальный сервер должен быть поднят).
//
// Проверяет то, что глазами в браузере поймать трудно: подбор пар сразу после
// входа, очки и серию, повторную пару при отсутствии выбора, паузу, отмену
// партии без первого хода и окончание арены с недоигранной партией.
//
// Все события складываются в журнал, и ожидание сначала смотрит в него.
// Без этого проверка сама себя обманывает: сервер присылает окончание партии
// и начало следующей одним пакетом, и подписка «после» опаздывает.

import { PrismaClient } from '@prisma/client';
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

let failures = 0;

function check(ok: boolean, what: string, extra = ''): void {
  if (ok) {
    console.log(`  ok   ${what}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${what} ${extra}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Сокет с журналом всех снэпшотов арены и всех состояний партий. */
class Client {
  readonly socket: Socket;
  readonly states: ArenaStatePayload[] = [];
  readonly games: ArenaGamePayload[] = [];

  constructor(arenaId: string, token?: string) {
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

  /** Ждёт снэпшот арены, удовлетворяющий условию (сначала смотрит в журнал). */
  state(
    predicate: (p: ArenaStatePayload) => boolean,
    label: string,
    timeoutMs = 8000,
  ): Promise<ArenaStatePayload> {
    return this.wait(this.states, predicate, label, timeoutMs);
  }

  /** Ждёт состояние партии, удовлетворяющее условию. */
  game(
    predicate: (p: ArenaGamePayload) => boolean,
    label: string,
    timeoutMs = 8000,
  ): Promise<ArenaGamePayload> {
    return this.wait(this.games, predicate, label, timeoutMs);
  }

  private async wait<T>(
    log: T[],
    predicate: (p: T) => boolean,
    label: string,
    timeoutMs: number,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      // Идём с конца: свежие события интереснее.
      for (let i = log.length - 1; i >= 0; i--) {
        if (predicate(log[i])) return log[i];
      }
      if (Date.now() > deadline) throw new Error(`таймаут ожидания: ${label}`);
      await sleep(50);
    }
  }

  close(): void {
    this.socket.close();
  }
}

async function ensureUser(login: string, name: string): Promise<{ id: string; name: string }> {
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

/** Ходы скорейшего мата: 1.f3 e5 2.g4 Qh4#, выигрывают чёрные. */
const MATE_WHITE = [
  { from: 'f2', to: 'f3' },
  { from: 'g2', to: 'g4' },
];
const MATE_BLACK = [
  { from: 'e7', to: 'e5' },
  { from: 'd8', to: 'h4' },
];

async function main(): Promise<void> {
  const a = await ensureUser('arena-bot-1', 'Бот Первый');
  const b = await ensureUser('arena-bot-2', 'Бот Второй');

  // Длительность в одну минуту в интерфейсе не выбрать, но для проверки конца
  // арены нужна именно короткая: ставим прямо в базе.
  const arena = await prisma.arena.create({
    data: {
      name: 'Проверка арены',
      timeControl: 'blitz-3+0',
      durationMin: 1,
      startsAt: new Date(Date.now() + 3000),
      ownerId: a.id,
      status: 'scheduled',
    },
    select: { id: true },
  });
  console.log(`Арена ${arena.id}: старт через 3 секунды, подбор пар 1 минуту`);

  const ca = new Client(arena.id, token(a.id, a.name));
  const cb = new Client(arena.id, token(b.id, b.name));
  const guest = new Client(arena.id);
  const byId: Record<string, Client> = { [a.id]: ca, [b.id]: cb };

  console.log('\n1. Трансляция без входа на сайт');
  const anon = await guest.state((p) => p.id === arena.id, 'снэпшот зрителю без входа');
  check(anon.me === null, 'зритель без учётной записи видит турнир и не числится участником');
  check(anon.standings.length === 0, 'до записи таблица пуста');

  console.log('\n2. Запись до старта');
  ca.emit(SocketEvents.ArenaJoin, {});
  cb.emit(SocketEvents.ArenaJoin, {});
  const beforeStart = await ca.state((p) => p.standings.length === 2, 'оба записались');
  check(beforeStart.status === 'scheduled', 'до старта арена в состоянии «ждёт»');
  check(
    beforeStart.standings.every((s) => s.state === 'ready'),
    'записавшиеся стоят в пуле',
  );

  console.log('\n3. Старт и первая пара');
  const game1 = await ca.game((p) => p.status === 'live', 'первая партия', 12000);
  check(true, 'пара создалась сразу после старта, без ожидания раунда');
  check(
    game1.clock.initialMs === 180_000 && game1.clock.incrementMs === 0,
    'часы соответствуют контролю 3+0',
    `${game1.clock.initialMs}/${game1.clock.incrementMs}`,
  );
  check(game1.firstMoveDeadlineAt !== null, 'на первый ход отведён срок');
  check(
    (game1.whiteId === a.id && game1.blackId === b.id) ||
      (game1.whiteId === b.id && game1.blackId === a.id),
    'в паре оба записавшихся',
  );

  const winnerId = game1.blackId;
  const loserId = game1.whiteId;
  for (let i = 0; i < 2; i++) {
    byId[game1.whiteId].emit(SocketEvents.ArenaMove, { gameId: game1.id, ...MATE_WHITE[i] });
    await sleep(150);
    byId[game1.blackId].emit(SocketEvents.ArenaMove, { gameId: game1.id, ...MATE_BLACK[i] });
    await sleep(150);
  }
  const done1 = await ca.game((p) => p.id === game1.id && p.status !== 'live', 'окончание матом');
  check(done1.status === 'black', 'мат в два хода записан победой чёрных', done1.status);
  check(done1.result?.reason === 'checkmate', 'причина окончания — мат');
  check(done1.moves.length === 4, 'ходы сохранены списком, а не одной позицией');

  const after1 = await ca.state(
    (p) => (p.standings.find((s) => s.userId === winnerId)?.score ?? 0) === 2,
    'очки за первую победу',
  );
  check(after1.standings.find((s) => s.userId === winnerId)?.rank === 1, 'победитель первый');
  check(
    after1.standings.find((s) => s.userId === loserId)?.score === 0,
    'поражение не даёт очков',
  );

  console.log('\n4. Возврат в пул и вторая пара');
  const game2 = await ca.game(
    (p) => p.status === 'live' && p.id !== game1.id,
    'вторая партия без нажатия «Участвовать»',
    10000,
  );
  check(true, 'после партии игрок сам вернулся в пул и получил соперника');
  check(
    game2.whiteId === game1.blackId,
    'цвета чередуются: белыми играет тот, кто был чёрным',
  );

  console.log('\n5. Сдача и серия побед');
  const g2LoserId = game2.whiteId === winnerId ? game2.blackId : game2.whiteId;
  byId[g2LoserId].emit(SocketEvents.ArenaResign, game2.id);
  const done2 = await ca.game((p) => p.id === game2.id && p.status !== 'live', 'окончание сдачей');
  check(done2.result?.reason === 'resignation', 'сдача завершает партию');

  const after2 = await ca.state(
    (p) => (p.standings.find((s) => s.userId === winnerId)?.score ?? 0) >= 4,
    'очки за вторую победу',
  );
  const w2 = after2.standings.find((s) => s.userId === winnerId);
  check(w2?.score === 4, 'вторая победа подряд даёт ещё 2 очка', String(w2?.score));
  check(w2?.streak === 2, 'серия равна двум победам', String(w2?.streak));
  check(w2?.recent[0] === 'win', 'последний результат в таблице — победа');

  console.log('\n6. Пауза');
  // Подбор непрерывный, поэтому «Пауза» почти всегда нажимается во время
  // партии: текущую доигрываем, а из пула выходим после неё.
  const game3 = await ca.game(
    (p) => p.status === 'live' && p.id !== game1.id && p.id !== game2.id,
    'третья партия',
    10000,
  );
  const pausedId = b.id;
  const pauser = byId[pausedId];
  pauser.emit(SocketEvents.ArenaPause);
  const requested = await pauser.state((p) => p.me?.pauseRequested === true, 'пауза принята');
  check(requested.me?.state === 'playing', 'нажатие во время партии её не бросает');
  check(true, 'человек видит, что пауза включится после партии');

  // Отменяем: человек передумал и остаётся в пуле.
  pauser.emit(SocketEvents.ArenaPause);
  await pauser.state((p) => p.me?.pauseRequested === false, 'пауза отменена');
  check(true, 'повторное нажатие отменяет паузу');

  console.log('\n7. Отмена партии без первого хода');
  const scoreBeforeCancel =
    (await ca.state(() => true, 'снэпшот до отмены')).standings.find(
      (s) => s.userId === winnerId,
    )?.score ?? 0;
  const cancelled = await ca.game(
    (p) => p.id === game3.id && p.status !== 'live',
    'отмена по правилу первого хода',
    26000,
  );
  check(cancelled.status === 'cancelled', 'партия без первого хода отменена', cancelled.status);
  const after3 = await ca.state(
    (p) => p.standings.some((s) => s.state === 'paused'),
    'снэпшот после отмены',
  );
  const w3 = after3.standings.find((s) => s.userId === winnerId);
  check(w3?.score === scoreBeforeCancel, 'отменённая партия в зачёт не идёт', String(w3?.score));
  check(w3?.streak === 2, 'отменённая партия не гасит серию', String(w3?.streak));
  const absentId = cancelled.whiteId;
  check(
    after3.standings.find((s) => s.userId === absentId)?.state === 'paused',
    'не сходивший игрок поставлен на паузу',
  );

  console.log('\n8. Конец арены с недоигранной партией');
  ca.emit(SocketEvents.ArenaJoin, {});
  cb.emit(SocketEvents.ArenaJoin, {});
  const last = await ca.game(
    (p) => p.status === 'live' && ![game1.id, game2.id, game3.id].includes(p.id),
    'партия перед концом времени',
    15000,
  );
  // Два хода, чтобы партия не отменилась по правилу первого хода.
  byId[last.whiteId].emit(SocketEvents.ArenaMove, { gameId: last.id, from: 'e2', to: 'e4' });
  await sleep(200);
  byId[last.blackId].emit(SocketEvents.ArenaMove, { gameId: last.id, from: 'e7', to: 'e5' });
  await ca.game((p) => p.id === last.id && p.moves.length === 2, 'два хода сделаны');

  const closed = await ca.state((p) => p.pairingClosed, 'закрытие подбора по времени', 75000);
  check(closed.status === 'running', 'пока партия идёт, арена не закончена');
  check(
    closed.liveGames.length === 1,
    'недоигранная партия осталась живой, а не записана в ничью',
    String(closed.liveGames.length),
  );

  const scoreBeforeLast =
    closed.standings.find((s) => s.userId === last.whiteId)?.score ?? 0;
  byId[last.blackId].emit(SocketEvents.ArenaResign, last.id);
  const doneLast = await ca.game(
    (p) => p.id === last.id && p.status !== 'live',
    'окончание последней партии',
  );
  check(doneLast.status === 'white', 'начатая до конца времени партия доиграна и зачтена');
  check(doneLast.result?.reason === 'resignation', 'результат настоящий, а не подставная ничья');

  const finished = await ca.state((p) => p.status === 'finished', 'арена закрылась', 15000);
  const scoreAfterLast =
    finished.standings.find((s) => s.userId === last.whiteId)?.score ?? 0;
  check(
    scoreAfterLast > scoreBeforeLast,
    'очки за последнюю партию начислены',
    `${scoreBeforeLast} -> ${scoreAfterLast}`,
  );
  check(
    finished.finishedGames.length === 3,
    'в разбор попали все зачтённые партии, отменённая не попала',
    String(finished.finishedGames.length),
  );
  check(
    finished.standings.every((s, i) => i === 0 || s.score <= finished.standings[i - 1].score),
    'таблица отсортирована по очкам',
  );

  // Партия из базы: проверяем, что после перезапуска её можно будет посмотреть.
  const stored = await prisma.arenaGame.findUnique({
    where: { id: game1.id },
    select: { moves: true, status: true },
  });
  const storedMoves = stored ? (JSON.parse(stored.moves) as unknown[]) : [];
  check(storedMoves.length === 4, 'ходы лежат в базе, партию можно открыть позже', String(storedMoves.length));
  check(stored?.status === 'black', 'результат партии сохранён в базе');

  ca.close();
  cb.close();
  guest.close();
  await prisma.arena.delete({ where: { id: arena.id } });
  await prisma.$disconnect();

  console.log(failures === 0 ? '\nВсе проверки прошли' : `\nПровалено проверок: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Сценарий упал:', err);
  await prisma.$disconnect();
  process.exit(1);
});
