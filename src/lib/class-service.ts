// Хелперы для работы с моделью Class.

import { prisma } from '@/lib/db';
import { ensureUniqueSlug } from '@/lib/slug';

/** Гарантирует, что у пользователя есть Class. Возвращает класс с owner. */
export async function ensureClassForUser(userId: string) {
  const existing = await prisma.class.findUnique({
    where: { ownerId: userId },
    include: { owner: { select: { id: true, displayName: true } } },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });
  if (!user) throw new Error('User not found');

  const slug = await ensureUniqueSlug(user.displayName, async (cand) => {
    const hit = await prisma.class.findUnique({ where: { slug: cand } });
    return Boolean(hit);
  });

  return prisma.class.create({
    data: {
      ownerId: userId,
      slug,
      name: null,
      isPublic: true,
    },
    include: { owner: { select: { id: true, displayName: true } } },
  });
}

/** Отображаемое имя класса: name → или displayName учителя. */
export function classDisplayName(cls: {
  name: string | null;
  owner: { displayName: string };
}): string {
  return cls.name && cls.name.trim() ? cls.name : `Класс — ${cls.owner.displayName}`;
}
