import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Сохраняет выбор пользователя в баннере cookie.
 *
 * Выбор всегда хранится в браузере (см. lib/consent.ts) — этого достаточно,
 * чтобы больше не показывать баннер. Но браузер принадлежит пользователю, и как
 * доказательство его выбора он не годится. Поэтому у вошедших пользователей
 * решение дублируется в их профиль.
 *
 * Анонимных посетителей намеренно не записываем: чтобы отличать их друг от
 * друга, пришлось бы собирать дополнительные данные о людях, которые ничего о
 * себе не сообщали. Это противоречило бы принципу минимизации.
 */
interface Body {
  choice?: string;
}

export async function POST(request: Request) {
  const auth = await getCurrentUser();
  // Не ошибка: анонимный посетитель тоже вправе нажать кнопку, просто писать нечего.
  if (!auth) return NextResponse.json({ saved: false });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const choice = body.choice;
  if (choice !== 'accepted' && choice !== 'declined') {
    return NextResponse.json({ error: 'Недопустимое значение' }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { cookieConsent: choice, cookieConsentAt: new Date() },
    });
  } catch (err) {
    console.error('[consent] не удалось сохранить выбор:', err);
    return NextResponse.json({ error: 'Не удалось сохранить выбор' }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
