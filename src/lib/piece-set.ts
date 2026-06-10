/**
 * Наборы фигур (форма, не цвет). Цвета задаются темой фигур
 * (lib/board-theme.ts, CSS-переменные), а форма — глобальным стором:
 * PieceSvg подписан на него, поэтому смена набора мгновенно
 * перерисовывает фигуры на всех досках страницы.
 *
 * Выбор хранится в localStorage; гидратация — в PieceSetHydrator
 * (layout.tsx), чтобы не словить SSR-рассинхрон разметки.
 */

import { create } from 'zustand';

export type PieceSetId = 'neo' | 'classic' | 'minimal' | 'symbols' | 'retro' | 'volume';

export interface PieceSetInfo {
  id: PieceSetId;
  name: string;
}

export const PIECE_SET_KEY = 'gogachess-piece-set';

export const PIECE_SETS: PieceSetInfo[] = [
  { id: 'neo', name: 'Нео' },
  { id: 'classic', name: 'Классика' },
  { id: 'minimal', name: 'Минимал' },
  { id: 'symbols', name: 'Символы' },
  { id: 'retro', name: 'Газета' },
  { id: 'volume', name: 'Объём' },
];

interface PieceSetState {
  setId: PieceSetId;
  setPieceSet: (id: PieceSetId) => void;
}

export const usePieceSetStore = create<PieceSetState>((set) => ({
  // «Классика» — дефолтный набор (стиль cburnett, как на Lichess).
  setId: 'classic',
  setPieceSet: (id) => {
    set({ setId: id });
    try {
      localStorage.setItem(PIECE_SET_KEY, id);
    } catch {
      /* приватный режим — выбор не сохранится, но применится */
    }
  },
}));

/** Прочитать сохранённый набор после монтирования (см. PieceSetHydrator). */
export function hydratePieceSet(): void {
  try {
    const saved = localStorage.getItem(PIECE_SET_KEY);
    if (saved && PIECE_SETS.some((s) => s.id === saved)) {
      usePieceSetStore.setState({ setId: saved as PieceSetId });
    }
  } catch {
    /* ок */
  }
}
