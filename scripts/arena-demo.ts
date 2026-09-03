// Проверка арены вживую, когда играть не с кем.
// Запуск: npx tsx scripts/arena-demo.ts (локальный сервер должен быть поднят).
//
// Создаёт арену на полчаса и держит в ней соперника, который ходит сам —
// случайными законными ходами с задержкой в пару секунд, чтобы было видно,
// как тикают его часы. Останавливается по Ctrl+C.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Chess } from 'chess.js';
import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';

import {
  SocketEvents,
  type ArenaGamePayload,
  type ArenaStatePayload,
} from '../src/lib/socket-events';

const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const URL = 'http://localhost:3000';
const PASSWORD = 'arena-demo-1234';

async function ensureBot(): Promise<{ id: string; email: string }> {
  const email = 'arena-bot-2@arena.local';
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, emailVerifiedAt: new Date() },
    create: {
      email,
      displayName: 'Бот Второй',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  return { id: user.id, email };
}

async function main(): Promise<void> {
  const bot = await ensureBot();

  const arena = await prisma.arena.create({
    data: {
      name: 'Демо арена',
      timeControl: 'blitz-5+0',
      durationMin: 30,
      startsAt: new Date(Date.now() + 20_000),
      status: 'scheduled',
      ownerId: bot.id,
    },
    select: { id: true },
  });

  console.log('Арена:    ' + `${URL}/tournaments/${arena.id}`);
  console.log('Старт:    через 20 секунд');
  console.log('Соперник: Бот Второй, ходит сам, пока сценарий не остановлен\n');

  const token = jwt.sign({ sub: bot.id, name: 'Бот Второй' }, SECRET, { expiresIn: '4h' });
  const socket = io(`${URL}/arena`, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie: `chess_token=${token}` },
  });

  const thinking = new Set<string>();

  socket.on('connect', () => socket.emit(SocketEvents.ArenaWatch, arena.id));

  socket.on(SocketEvents.ArenaState, (p: ArenaStatePayload) => {
    // Записываемся после первого снимка: сервер узнаёт нужную арену из
    // события «смотрю», а до него запись пропала бы впустую.
    if (!p.me) socket.emit(SocketEvents.ArenaJoin, {});
    if (p.status === 'finished') console.log('Арена закончилась, можно останавливать (Ctrl+C)');
  });

  socket.on(SocketEvents.ArenaGameState, (game: ArenaGamePayload) => {
    const mine = game.whiteId === bot.id || game.blackId === bot.id;
    if (!mine || game.status !== 'live') return;
    const chess = new Chess(game.fen);
    if (chess.turn() !== (game.whiteId === bot.id ? 'w' : 'b')) return;

    // Один ход на одну позицию: снимок партии приходит и после чужих событий.
    const key = `${game.id}:${game.moves.length}`;
    if (thinking.has(key)) return;
    thinking.add(key);

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return;
    const pick = moves[Math.floor(Math.random() * moves.length)];
    setTimeout(
      () =>
        socket.emit(SocketEvents.ArenaMove, {
          gameId: game.id,
          from: pick.from,
          to: pick.to,
          promotion: pick.promotion ?? undefined,
        }),
      1200 + Math.random() * 1800,
    );
  });

  socket.on(SocketEvents.ArenaError, (text: string) => console.log('Сервер: ' + text));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
