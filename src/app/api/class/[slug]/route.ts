import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/class/[slug] — публичные данные класса для ученика.
// Если установлен accessCode — задачи отдаются только при правильном коде
// (через ?code= или header x-class-access).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cls = await prisma.class.findUnique({
    where: { slug },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (!cls) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const auth = await getCurrentUser();
  const isOwner = auth?.sub === cls.ownerId;

  // Проверка кода доступа.
  let codeAccepted = !cls.accessCode;
  if (!codeAccepted) {
    const url = new URL(req.url);
    const provided =
      url.searchParams.get('code') ||
      req.headers.get('x-class-access') ||
      '';
    if (provided === cls.accessCode) codeAccepted = true;
  }
  if (isOwner) codeAccepted = true;

  const tasks =
    codeAccepted
      ? await prisma.task.findMany({
          where: { classId: cls.id, isPublished: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

  return NextResponse.json({
    class: {
      id: cls.id,
      slug: cls.slug,
      name: cls.name,
      ownerId: cls.ownerId,
      ownerName: cls.owner.displayName,
      isPublic: cls.isPublic,
      hasAccessCode: Boolean(cls.accessCode),
    },
    codeAccepted,
    tasks,
    isOwner,
  });
}
