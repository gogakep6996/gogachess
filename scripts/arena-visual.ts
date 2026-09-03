// Визуальная проверка арены: создаёт короткий турнир и партию с ходами,
// чтобы посмотреть новую раскладку доски с историей ходов.
// Запускать при работающем dev-сервере: npx tsx scripts/arena-visual.ts

import { io, type Socket } from 'socket.io-client';
import { Chess } from 'chess.js';
import jwt from 'jsonwebtoken';

import { prisma } from '../src/lib/db';
import { SocketEvents } from '../src/lib/socket-events';
import type { ArenaGamePayload, ArenaStatePayload } from '../src/lib/socket-events';

const BASE = 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function tokenFor(userId: string, name: string): string {
  return jwt.sign({ sub: userId, name }, SECRET, { expiresIn: '1h' });
}

async function ensureUser(login: string, name: string) {
  return prisma.user.upsert({
    where: { email: `${login}@arena.local` },
    update: {},
    create: {
      email: `${login}@arena.local`,
      displayName: name,
      passwordHash: 'not-a-real-hash',
      emailVerifiedAt: new Date(),
    },
  });
}

class Bot {
  readonly socket: Socket;
  gameId: string | null = null;
  private game: ArenaGamePayload | null = null;

  constructor(
    private readonly arenaId: string,
    readonly userId: string,
    name: string,
  ) {
    this.socket = io(`${BASE}/arena`, {
      extraHeaders: { cookie: `chess_token=${tokenFor(userId, name)}` },
      transports: ['websocket'],
    });
  }

  start(): void {
    this.socket.on('connect', () => {
      this.socket.emit(SocketEvents.ArenaWatch, { arenaId: this.arenaId });
      this.socket.emit(SocketEvents.ArenaJoin, { arenaId: this.arenaId });
    });
    this.socket.on(SocketEvents.ArenaState, (s: ArenaStatePayload) => {
      if (s.me?.gameId && s.me.gameId !== this.gameId) {
        this.gameId = s.me.gameId;
        this.socket.emit(SocketEvents.ArenaGameWatch, { arenaId: this.arenaId, gameId: s.me.gameId });
      }
    });
    this.socket.on(SocketEvents.ArenaGameState, (g: ArenaGamePayload) => {
      if (g.whiteId !== this.userId && g.blackId !== this.userId) return;
      this.game = g;
      this.gameId = g.id;
      this.maybeMove();
    });
  }

  private maybeMove(): void {
    const g = this.game;
    if (!g || g.status !== 'live') return;
    const turn = g.fen.split(' ')[1];
    const mine = (turn === 'w' && g.whiteId === this.userId) || (turn === 'b' && g.blackId === this.userId);
    if (!mine) return;
    const chess = new Chess(g.fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return;
    const pick = moves[Math.floor(Math.random() * moves.length)];
    setTimeout(() => {
      this.socket.emit(SocketEvents.ArenaMove, {
        arenaId: this.arenaId,
        gameId: g.id,
        from: pick.from,
        to: pick.to,
        promotion: pick.promotion,
      });
    }, 400);
  }
}

async function main() {
  const a = await ensureUser('arena-bot-1', 'Бот Первый');
  const b = await ensureUser('arena-bot-2', 'Бот Второй');

  const arena = await prisma.arena.create({
    data: {
      name: 'Проверка раскладки',
      timeControl: 'blitz-5+0',
      durationMin: 10,
      startsAt: new Date(Date.now() + 3_000),
      ownerId: a.id,
    },
  });
  console.log(`Арена: ${BASE}/tournaments/${arena.id}`);

  new Bot(arena.id, a.id, 'Бот Первый').start();
  new Bot(arena.id, b.id, 'Бот Второй').start();

  console.log('Боты играют. Остановить — Ctrl+C.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
