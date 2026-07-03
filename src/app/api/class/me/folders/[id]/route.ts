import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Проверяет, что папка принадлежит классу текущего учителя. */
async function authorize(folderId: string, userId: string) {
  const folder = await prisma.homeworkFolder.findUnique({
    where: { id: folderId },
    include: { class: true },
  });
  if (!folder) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  if (folder.class.ownerId !== userId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { folder };
}

// PATCH /api/class/me/folders/[id] — переименовать { name } / изменить порядок { position }.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const result = await authorize(id, auth.sub);
  if ('error' in result) return result.error;

  const body = (await req.json().catch(() => ({}))) as { name?: string; position?: number };
  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 60);
    if (name) data.name = name;
  }
  if (body.position !== undefined) data.position = Number(body.position);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const folder = await prisma.homeworkFolder.update({ where: { id }, data });
  return NextResponse.json({ folder });
}

// DELETE /api/class/me/folders/[id] — удалить папку.
// Задачи не удаляются: folderId у них обнуляется (onDelete: SetNull в схеме).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getCurrentUser();
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const result = await authorize(id, auth.sub);
  if ('error' in result) return result.error;

  await prisma.homeworkFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
