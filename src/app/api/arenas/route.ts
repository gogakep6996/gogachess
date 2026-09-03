import { NextResponse } from 'next/server';

import { checkStartFen } from '@/lib/arena-fen';
import { requireVerifiedUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ARENA_DURATIONS, ARENA_TIME_CONTROLS } from '@/lib/socket-events';

/** Сколько незакрытых турниров можно держать одному человеку — защита от спама. */
const MAX_OPEN_PER_USER = 3;
/** Насколько вперёд можно назначить старт. */
const MAX_AHEAD_MS = 30 * 24 * 60 * 60_000;
/** Минимальный запас до старта: меньше — люди не успеют записаться. */
const MIN_AHEAD_MS = 60_000;

interface CreateBody {
  name?: string;
  timeControl?: string;
  durationMin?: number;
  /** ISO-время старта. */
  startsAt?: string;
  /** Код доступа: если задан, войти в турнир можно только с ним. */
  accessCode?: string;
  /** Своя начальная позиция (FEN). Пусто — обычная начальная позиция. */
  startFen?: string;
}

const ALLOWED_TIME_CONTROLS = new Set<string>(ARENA_TIME_CONTROLS.map((t) => t.id));
const ALLOWED_DURATIONS = new Set<number>(ARENA_DURATIONS);

export async function POST(request: Request) {
  const auth = await requireVerifiedUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос' }, { status: 400 });
  }

  const name = (body.name ?? '').trim().slice(0, 60) || 'Арена';

  const timeControl = (body.timeControl ?? '').trim();
  if (!ALLOWED_TIME_CONTROLS.has(timeControl)) {
    return NextResponse.json({ error: 'Выберите контроль времени из списка' }, { status: 400 });
  }

  const durationMin = Number(body.durationMin);
  if (!ALLOWED_DURATIONS.has(durationMin)) {
    return NextResponse.json({ error: 'Выберите длительность из списка' }, { status: 400 });
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Укажите время начала' }, { status: 400 });
  }
  const ahead = startsAt.getTime() - Date.now();
  if (ahead < MIN_AHEAD_MS) {
    return NextResponse.json(
      { error: 'Начало должно быть хотя бы через минуту, иначе никто не успеет записаться' },
      { status: 400 },
    );
  }
  if (ahead > MAX_AHEAD_MS) {
    return NextResponse.json({ error: 'Начало не позже чем через месяц' }, { status: 400 });
  }

  const accessCodeRaw = (body.accessCode ?? '').trim().slice(0, 32);
  const accessCode = accessCodeRaw ? accessCodeRaw : null;

  // Позицию проверяем здесь же: партии раздаёт сервер, и невозможная позиция
  // сломала бы каждую пару турнира, а не одну партию.
  const startPosition = checkStartFen((body.startFen ?? '').slice(0, 120));
  if (startPosition.error) {
    return NextResponse.json({ error: startPosition.error }, { status: 400 });
  }

  const open = await prisma.arena.count({
    where: { ownerId: auth.userId, status: { in: ['scheduled', 'running'] } },
  });
  if (open >= MAX_OPEN_PER_USER) {
    return NextResponse.json(
      {
        error: `Больше ${MAX_OPEN_PER_USER} незакрытых турниров одновременно держать нельзя. Дождитесь окончания или удалите ненужный.`,
      },
      { status: 400 },
    );
  }

  const arena = await prisma.arena.create({
    data: {
      name,
      timeControl,
      durationMin,
      startsAt,
      accessCode,
      startFen: startPosition.fen,
      ownerId: auth.userId,
      status: 'scheduled',
    },
    select: { id: true },
  });

  return NextResponse.json({ id: arena.id });
}
