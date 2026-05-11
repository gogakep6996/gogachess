import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
