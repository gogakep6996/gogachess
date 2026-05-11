import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (t.status === 'finished') {
    return NextResponse.json({ error: 'Турнир завершён' }, { status: 400 });
  }
  await prisma.tournamentPlayer.upsert({
    where: { tournamentId_userId: { tournamentId: id, userId: auth.sub } },
    update: { isAvailable: true },
    create: { tournamentId: id, userId: auth.sub, isAvailable: true },
  });
  return NextResponse.json({ ok: true });
}
