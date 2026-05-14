// Базовый тип шахматной фигуры используется и в браузере (SVG-компоненты),
// и в Node-сервере (FEN-утилиты). Чтобы серверу не тащить React-компоненты,
// держим тип в отдельном lightweight-модуле.

export type PieceColor = 'w' | 'b';
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type PieceCode = `${PieceColor}${PieceType}`;
