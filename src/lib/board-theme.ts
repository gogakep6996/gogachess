/**
 * Темы оформления шахматной доски и фигур (выбираются независимо).
 *
 * Как работает:
 *  - Тема доски задаёт цвета клеток, тема фигур — заливку/контур фигур.
 *  - Всё через CSS-переменные: CSS для всех тем генерируется один раз на
 *    сервере (buildBoardThemeCss) и вставляется в <head> в layout.tsx,
 *    поэтому смена темы мгновенная, без перерисовки React-дерева.
 *  - Выбор хранится в localStorage и применяется через атрибуты
 *    data-board-theme / data-piece-theme на <html> (bootstrap-скрипт в
 *    layout.tsx ставит их до первой отрисовки, чтобы не было «мигания»).
 */

export interface BoardTheme {
  id: string;
  /** Короткое название для выбора в меню. */
  name: string;
  /** Светлая / тёмная клетки (сплошной цвет — используется и в превью). */
  light: string;
  dark: string;
  /**
   * Опциональный полный CSS-background клетки (градиенты для «текстурных»
   * тем: дерево, стекло, мрамор). Если не задан — берётся сплошной цвет.
   */
  lightBg?: string;
  darkBg?: string;
}

export interface PieceTheme {
  id: string;
  name: string;
  /** Белые фигуры: заливка и контур. */
  wFill: string;
  wStroke: string;
  /** Чёрные фигуры: заливка и контур. */
  bFill: string;
  bStroke: string;
}

export const BOARD_THEME_KEY = 'gogachess-board-theme';
export const PIECE_THEME_KEY = 'gogachess-piece-theme';
// Дефолт — «Изумруд»: зелёная доска в единой палитре с зелёным акцентом UI.
// У пользователей с сохранённой темой в localStorage останется их выбор.
export const DEFAULT_BOARD_THEME = 'emerald';
export const DEFAULT_PIECE_THEME = 'neo';

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Классика', light: '#f0d9b5', dark: '#b58863' },
  { id: 'emerald', name: 'Изумруд', light: '#ffffdd', dark: '#86a666' },
  { id: 'ocean', name: 'Океан', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'walnut', name: 'Орех', light: '#e8c99b', dark: '#9e6b3f' },
  { id: 'ice', name: 'Лёд', light: '#eef4fa', dark: '#94b3cf' },
  { id: 'amethyst', name: 'Аметист', light: '#ece1f4', dark: '#9a77b8' },
  { id: 'rose', name: 'Роза', light: '#f7e3e7', dark: '#c98797' },
  { id: 'night', name: 'Ночь', light: '#9ca3af', dark: '#4b5563' },
  { id: 'coral', name: 'Коралл', light: '#fcebdd', dark: '#dd8e63' },
  { id: 'forest', name: 'Лес', light: '#dce5c8', dark: '#71924e' },
  // --- Текстурные темы (градиенты вместо плоского цвета) ---
  {
    id: 'darkwood',
    name: 'Тёмное дерево',
    light: '#c9a26d',
    dark: '#674220',
    lightBg:
      'linear-gradient(135deg, #d3ad77 0%, #c9a26d 38%, #bd9460 62%, #c9a26d 100%)',
    darkBg:
      'linear-gradient(135deg, #744b26 0%, #674220 40%, #56351a 70%, #674220 100%)',
  },
  {
    id: 'glass',
    name: 'Стекло',
    light: '#e6eef4',
    dark: '#7e9db4',
    lightBg:
      'linear-gradient(160deg, rgba(255,255,255,0.95) 0%, #e6eef4 45%, #d3e0ea 100%)',
    darkBg:
      'linear-gradient(160deg, #93b1c6 0%, #7e9db4 45%, #6a8aa2 80%, #7e9db4 100%)',
  },
  {
    id: 'marble',
    name: 'Мрамор',
    light: '#e9e6df',
    dark: '#8d8a85',
    lightBg:
      'linear-gradient(120deg, #f2efe9 0%, #e9e6df 35%, #ddd9d0 65%, #ece9e2 100%)',
    darkBg:
      'linear-gradient(120deg, #99968f 0%, #8d8a85 35%, #7b7873 70%, #918e88 100%)',
  },
];

export const PIECE_THEMES: PieceTheme[] = [
  // Дефолт: чисто-белые против тёмно-серых (как на крупных шахматных площадках).
  {
    id: 'neo',
    name: 'Нео',
    wFill: '#ffffff',
    wStroke: '#57544f',
    bFill: '#4b4847',
    bStroke: '#27241f',
  },
  {
    id: 'classic',
    name: 'Классика',
    wFill: '#fbf6ee',
    wStroke: '#1f1a14',
    bFill: '#1f1a14',
    bStroke: '#000000',
  },
  {
    id: 'ivory',
    name: 'Графит',
    wFill: '#f6f1e7',
    wStroke: '#44403c',
    bFill: '#4a4a4f',
    bStroke: '#1c1c1f',
  },
  {
    id: 'navy',
    name: 'Синие',
    wFill: '#f5faff',
    wStroke: '#1e3a5f',
    bFill: '#1f3a55',
    bStroke: '#0c1825',
  },
  {
    id: 'green',
    name: 'Зелёные',
    wFill: '#f6fbef',
    wStroke: '#2a4216',
    bFill: '#2c4a1e',
    bStroke: '#12200a',
  },
  {
    id: 'purple',
    name: 'Фиолет',
    wFill: '#fbf7ff',
    wStroke: '#46295e',
    bFill: '#44285c',
    bStroke: '#1f0f2e',
  },
  {
    id: 'wine',
    name: 'Бордо',
    wFill: '#fff6f4',
    wStroke: '#5c1f1f',
    bFill: '#5e2226',
    bStroke: '#2b0d0f',
  },
  {
    id: 'bronze',
    name: 'Бронза',
    wFill: '#f9ead2',
    wStroke: '#6e4a1c',
    bFill: '#6e4a1c',
    bStroke: '#36230b',
  },
  {
    id: 'crimson-vs-blue',
    name: 'Красн/Син',
    wFill: '#c0392b',
    wStroke: '#6e1408',
    bFill: '#1f4e8c',
    bStroke: '#0c2342',
  },
  {
    id: 'choco',
    name: 'Шоколад',
    wFill: '#f3e2c8',
    wStroke: '#4c2f17',
    bFill: '#43290f',
    bStroke: '#1d1004',
  },
];

export function getBoardTheme(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function getPieceTheme(id: string | null | undefined): PieceTheme {
  return PIECE_THEMES.find((t) => t.id === id) ?? PIECE_THEMES[0];
}

/**
 * CSS для всех тем: переменные на html[data-board-theme] / html[data-piece-theme].
 * Дефолты (без атрибута) — первые темы, чтобы доска была цветной даже до
 * выполнения bootstrap-скрипта.
 */
export function buildBoardThemeCss(): string {
  const baseVars = `${boardVars(BOARD_THEMES[0])};${pieceVars(PIECE_THEMES[0])}`;
  const perBoard = BOARD_THEMES.map(
    (t) => `html[data-board-theme="${t.id}"]{${boardVars(t)}}`,
  ).join('\n');
  const perPiece = PIECE_THEMES.map(
    (t) => `html[data-piece-theme="${t.id}"]{${pieceVars(t)}}`,
  ).join('\n');
  return `:root{${baseVars}}\n${perBoard}\n${perPiece}`;
}

function boardVars(t: BoardTheme): string {
  return [
    `--board-light:${t.light}`,
    `--board-dark:${t.dark}`,
    // Полный background клетки: градиент у текстурных тем, иначе цвет.
    `--board-light-bg:${t.lightBg ?? t.light}`,
    `--board-dark-bg:${t.darkBg ?? t.dark}`,
  ].join(';');
}

function pieceVars(t: PieceTheme): string {
  return [
    `--piece-w-fill:${t.wFill}`,
    `--piece-w-stroke:${t.wStroke}`,
    `--piece-b-fill:${t.bFill}`,
    `--piece-b-stroke:${t.bStroke}`,
  ].join(';');
}
