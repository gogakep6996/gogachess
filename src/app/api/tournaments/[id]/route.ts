import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      owner: { select: { displayName: true } },
      players: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { score: 'desc' },
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
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    id: t.id,
    name: t.name,
    timeControl: t.timeControl,
    durationMin: t.durationMin,
    startsAt: t.startsAt.toISOString(),
    endsAt:
      t.status === 'running'
        ? new Date(t.startsAt.getTime() + t.durationMin * 60_000).toISOString()
        : null,
    status: t.status,
    ownerName: t.owner.displayName,
    standings: t.players
      .slice()
      .sort((a, b) => b.score - a.score || b.played - a.played)
      .map((p, i) => ({
        userId: p.userId,
        name: p.user.displayName,
        score: p.score,
        played: p.played,
        rank: i + 1,
        isAvailable: p.isAvailable,
      })),
    matches: t.matches.map((m) => ({
      id: m.id,
      roomCode: m.room?.code ?? null,
      whiteId: m.whiteId,
      whiteName: m.white.displayName,
      blackId: m.blackId,
      blackName: m.black.displayName,
      status: m.status,
      fen: m.room?.fen ?? undefined,
    })),
  });
}

/** Удаление турнира — только владелец. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const t = await prisma.tournament.findUnique({ where: { id }, select: { ownerId: true } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (t.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Удалять может только организатор' }, { status: 403 });
  }

  // Сначала чистим связанные игровые комнаты (FK match.roomId — SetNull при удалении
  // комнаты, поэтому удаляем матчи раньше). Игроки/матчи турнира удалятся каскадом.
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } });
  await prisma.room.deleteMany({ where: { tournamentId: id } });
  await prisma.tournament.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

interface PatchBody {
  /** Новое время старта (ISO) — для перезапуска завершённого турнира. */
  startsAt?: string;
}

/** Перезапуск завершённого турнира на новое время — только владелец. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const t = await prisma.tournament.findUnique({
    where: { id },
    select: { ownerId: true, status: true },
  });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (t.ownerId !== auth.sub) {
    return NextResponse.json({ error: 'Перезапускать может только организатор' }, { status: 403 });
  }
  if (t.status !== 'finished') {
    return NextResponse.json(
      { error: 'Перезапустить можно только завершённый турнир' },
      { status: 400 },
    );
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const startsAt = new Date(body.startsAt ?? '');
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Неверная дата старта' }, { status: 400 });
  }

  // Чистый перезапуск: убираем прошлые партии, комнаты и участников — все
  // заходят заново. Сохраняем только сам турнир (название, контроль, длительность).
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } });
  await prisma.room.deleteMany({ where: { tournamentId: id } });
  await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: id } });
  await prisma.tournament.update({
    where: { id },
    data: { status: 'scheduled', startsAt },
  });

  return NextResponse.json({ ok: true });
}
