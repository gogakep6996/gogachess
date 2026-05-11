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
  await prisma.tournamentPlayer.update({
    where: { tournamentId_userId: { tournamentId: id, userId: auth.sub } },
    data: { isAvailable: false },
  });
  return NextResponse.json({ ok: true });
}
