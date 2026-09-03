// Разбор начальной позиции турнира. Пустое поле означает обычную начальную
// позицию — так же, как на личессе. Проверка одна и та же на клиенте (превью
// в форме) и на сервере (создание турнира), чтобы человек не увидел «позиция
// принята», а потом отказ.
//
// chess.js проверяет далеко не всё: он пропускает позицию, где под боем король
// стороны, которая не ходит (её можно «выиграть» взятием короля), и требует
// ровно шесть полей FEN, хотя из редакторов часто копируют короткую запись.
// Поэтому FEN сначала достраиваем, потом проверяем сами.

import { Chess } from 'chess.js';

import { deriveCastlingRights } from '@/lib/fen';
import { STARTING_FEN } from '@/lib/socket-events';

export interface StartFenCheck {
  /** Позиция для турнира. null — обычная начальная. */
  fen: string | null;
  /** Понятная причина отказа. null — всё в порядке. */
  error: string | null;
}

/**
 * Достраивает недостающие поля FEN: из редакторов копируют по-разному, часто
 * одну расстановку. Права на рокировку в короткой записи выводим из позиции
 * королей и ладей — иначе рокировка в турнире была бы запрещена молча.
 */
function withAllFields(raw: string): string {
  const p = raw.split(/\s+/);
  const placement = p[0] ?? '';
  const side = p[1] === 'b' ? 'b' : 'w';
  const full = `${placement} ${side} ${p[2] ?? '-'} ${p[3] ?? '-'} ${p[4] ?? '0'} ${p[5] ?? '1'}`;
  return p[2] ? full : deriveCastlingRights(full);
}

/** Есть ли пешка на первом или последнем ряду — такая позиция не играется. */
function hasPawnOnEdgeRank(placement: string): boolean {
  const ranks = placement.split('/');
  if (ranks.length !== 8) return false;
  return /p/i.test(ranks[0]) || /p/i.test(ranks[7]);
}

/** Под боем ли король стороны, которая сейчас не ходит. */
function idleKingAttacked(fen: string): boolean {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  // Поле взятия на проходе относится к прежней стороне хода: с перевёрнутой
  // очередью chess.js такую запись не примет, а нам важен только шах.
  parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).inCheck();
  } catch {
    return false;
  }
}

/**
 * Проверяет введённую позицию и приводит её к полному FEN.
 * Пустая строка — не ошибка: турнир пойдёт со стандартной позиции.
 */
export function checkStartFen(raw: string): StartFenCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { fen: null, error: null };

  const fen = withAllFields(trimmed);

  if (hasPawnOnEdgeRank(fen.split(' ')[0])) {
    return { fen: null, error: 'Пешка не может стоять на первом или последнем ряду.' };
  }

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    return {
      fen: null,
      error: /king/i.test(message)
        ? 'На доске должно быть по одному королю каждого цвета.'
        : 'Не удалось прочитать позицию. Скопируйте FEN из редактора доски целиком.',
    };
  }

  if (idleKingAttacked(fen)) {
    return {
      fen: null,
      error: 'Король стороны, которая не начинает, стоит под боем — такой позиции не бывает.',
    };
  }
  if (chess.isGameOver()) {
    return { fen: null, error: 'В этой позиции партия уже закончена: играть будет нечем.' };
  }

  const normalized = chess.fen();
  // Стандартную позицию храним как «нет своей позиции»: тогда и правило
  // первого хода, и подписи в интерфейсе работают как в обычном турнире.
  return { fen: normalized === STARTING_FEN ? null : normalized, error: null };
}
