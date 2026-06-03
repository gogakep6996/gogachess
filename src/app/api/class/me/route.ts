import { NextResponse } from 'next/server';
import { getCurrentUser, requireVerifiedUser } from '@/lib/auth';
import { ensureClassForUser } from '@/lib/class-service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/class/me — возвращает класс текущего пользователя и его задачи.
// Создание класса (ensureClassForUser) требует подтверждённого email — иначе
// каждый бот мог бы засеять базу пустыми классами.
export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Если у пользователя уже есть класс — отдадим без проверки email,
  // чтобы прежние учителя могли работать как раньше. Гейтим только создание.
  const existing = await prisma.class.findUnique({
    where: { ownerId: auth.sub },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (!existing) {
    const guard = await requireVerifiedUser();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error, needsVerification: true }, { status: guard.status });
    }
  }

  const cls = existing ?? (await ensureClassForUser(auth.sub));
  const tasks = await prisma.task.findMany({
    where: { classId: cls.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({
    class: {
      id: cls.id,
      slug: cls.slug,
      name: cls.name,
      accessCode: cls.accessCode,
      isPublic: cls.isPublic,
      ownerName: cls.owner.displayName,
    },
    tasks,
  });
}

// PATCH /api/class/me — обновить настройки класса.
export async function PATCH(req: Request) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cls = await ensureClassForUser(auth.sub);
  const body = (await req.json().catch(() => ({}))) as {
    name?: string | null;
    accessCode?: string | null;
    isPublic?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const t = (body.name ?? '').trim();
    data.name = t === '' ? null : t.slice(0, 80);
  }
  if (body.accessCode !== undefined) {
    const t = (body.accessCode ?? '').trim();
    data.accessCode = t === '' ? null : t.slice(0, 32);
  }
  if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic);

  const updated = await prisma.class.update({
    where: { id: cls.id },
    data,
  });

  return NextResponse.json({
    class: {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      accessCode: updated.accessCode,
      isPublic: updated.isPublic,
    },
  });
}
