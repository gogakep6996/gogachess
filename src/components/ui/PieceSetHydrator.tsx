'use client';

import { useEffect } from 'react';
import { hydratePieceSet } from '@/lib/piece-set';

/**
 * Применяет сохранённый в localStorage набор фигур после первого рендера.
 * Отдельным компонентом в layout, чтобы SSR-разметка не расходилась с клиентом.
 */
export function PieceSetHydrator() {
  useEffect(() => {
    hydratePieceSet();
  }, []);
  return null;
}
