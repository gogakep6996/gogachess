import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/class?q=имя — список публичных классов с количеством задач.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  const where = {
    isPublic: true,
    ...(q
      ? {
          OR: [
            { slug: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { owner: { displayName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const classes = await prisma.class.findMany({
    where,
    take: 60,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { displayName: true } },
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json({
    classes: classes.map((c) => ({
      slug: c.slug,
      name: c.name,
      ownerName: c.owner.displayName,
      tasksCount: c._count.tasks,
      hasAccessCode: Boolean(c.accessCode),
    })),
  });
}
