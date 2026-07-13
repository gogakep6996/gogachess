import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/class/me/library-folders — папки «Моей библиотеки» учителя
// (организационные, отдельные от папок ДЗ).
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cls = await prisma.class.findUnique({ where: { ownerId: auth.sub } });
  if (!cls) return NextResponse.json({ folders: [] });

  const folders = await prisma.libraryFolder.findMany({
    where: { classId: cls.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({ folders });
}

// POST /api/class/me/library-folders — создать папку { name }.
export async function POST(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cls = await ensureClassForUser(auth.sub);
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const maxPos = await prisma.libraryFolder.aggregate({
    where: { classId: cls.id },
    _max: { position: true },
  });

  const folder = await prisma.libraryFolder.create({
    data: {
      classId: cls.id,
      name,
      position: (maxPos._max.position ?? 0) + 1,
    },
  });

  return NextResponse.json({ folder });
}
