'use client';

// Шахматные фигуры. Несколько наборов форм («Классика», «Минимал», «Символы»),
// выбор хранится в глобальном сторе (lib/piece-set.ts) — смена набора мгновенно
// перерисовывает все доски. Цвета фигур управляются CSS-переменными темы
// (lib/board-theme.ts), поэтому форма и цвет комбинируются независимо.

import { useId } from 'react';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import type { PieceColor, PieceType, PieceCode } from '@/lib/piece';
import { usePieceSetStore, type PieceSetId } from '@/lib/piece-set';

export type { PieceColor, PieceType, PieceCode };

// Omit<…, 'type'> убирает встроенный SVG-атрибут type?: string. Иначе он
// «протекает» через {...rest} в дочерние компоненты и перебивает наш
// type: PieceType, давая ошибку TS2322 (string не присваивается PieceType).
interface Props extends Omit<SVGProps<SVGSVGElement>, 'type'> {
  code: PieceCode;
  /** Принудительный набор — для превью в меню. По умолчанию глобальный выбор. */
  set?: PieceSetId;
}

export function PieceSvg({ code, set, ...rest }: Props) {
  const globalSet = usePieceSetStore((s) => s.setId);
  const activeSet = set ?? globalSet;

  const color = code[0] as PieceColor;
  const type = code[1] as PieceType;
  // var() в SVG работает только через style, не через атрибуты.
  const fill =
    color === 'w' ? 'var(--piece-w-fill, #fbf6ee)' : 'var(--piece-b-fill, #1f1a14)';
  const stroke =
    color === 'w' ? 'var(--piece-w-stroke, #1f1a14)' : 'var(--piece-b-stroke, #000)';

  if (activeSet === 'symbols') {
    return <SymbolPiece glyph={SYMBOL_FILLED[type]} fill={fill} stroke={stroke} {...rest} />;
  }
  if (activeSet === 'retro') {
    // «Газета»: белые — контурные глифы (линии цветом контура с подложкой-ореолом),
    // чёрные — заполненные. Классический книжно-диаграммный вид.
    return color === 'w' ? (
      <SymbolPiece glyph={SYMBOL_OUTLINE[type]} fill={stroke} stroke={fill} {...rest} />
    ) : (
      <SymbolPiece glyph={SYMBOL_FILLED[type]} fill={fill} stroke={stroke} {...rest} />
    );
  }
  if (activeSet === 'minimal') {
    return <MinimalPiece type={type} fill={fill} stroke={stroke} {...rest} />;
  }
  if (activeSet === 'classic') {
    return <ClassicPiece type={type} fill={fill} stroke={stroke} {...rest} />;
  }
  if (activeSet === 'volume') {
    // «Объём»: классические формы + тень и градиентный блик (псевдо-3D).
    return <VolumePiece type={type} fill={fill} stroke={stroke} {...rest} />;
  }
  return <NeoPiece type={type} fill={fill} stroke={stroke} {...rest} />;
}

interface RenderProps extends Omit<SVGProps<SVGSVGElement>, 'type'> {
  type: PieceType;
  fill: string;
  stroke: string;
}

// ---------------------------------------------------------------------------
// «Символы» / «Газета» — типографские шахматные глифы. \uFE0E заставляет
// браузер рисовать текстовый вариант, а не emoji.
// ---------------------------------------------------------------------------

const SYMBOL_FILLED: Record<PieceType, string> = {
  k: '\u265A\uFE0E',
  q: '\u265B\uFE0E',
  r: '\u265C\uFE0E',
  b: '\u265D\uFE0E',
  n: '\u265E\uFE0E',
  p: '\u265F\uFE0E',
};

const SYMBOL_OUTLINE: Record<PieceType, string> = {
  k: '\u2654\uFE0E',
  q: '\u2655\uFE0E',
  r: '\u2656\uFE0E',
  b: '\u2657\uFE0E',
  n: '\u2658\uFE0E',
  p: '\u2659\uFE0E',
};

interface SymbolProps extends Omit<SVGProps<SVGSVGElement>, 'type'> {
  glyph: string;
  fill: string;
  stroke: string;
}

function SymbolPiece({ glyph, fill, stroke, ...rest }: SymbolProps) {
  const style: CSSProperties = {
    fill,
    stroke,
    strokeWidth: 0.9,
    paintOrder: 'stroke',
    fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif',
  };
  return (
    <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <text x="22.5" y="37.5" textAnchor="middle" fontSize="38" style={style}>
        {glyph}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// «Нео» — округлые современные фигуры (дефолт): крупные формы, толстый
// контур, как на популярных шахматных площадках.
// ---------------------------------------------------------------------------

function NeoPiece({ type, fill, stroke, ...rest }: RenderProps) {
  const style: CSSProperties = {
    fill,
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const base = <rect x="13" y="35" width="19" height="4.5" rx="2.2" />;

  let body: ReactNode;
  switch (type) {
    case 'p':
      body = (
        <>
          <circle cx="22.5" cy="13.5" r="6" />
          <path d="M17 35.5 C17 28.5 19.5 25.5 20.5 21.5 H24.5 C25.5 25.5 28 28.5 28 35.5 Z" />
        </>
      );
      break;
    case 'r':
      body = (
        <>
          <path d="M14.5 35 V31.5 L16.5 29 V14 H19.5 V17 H21 V14 H24 V17 H25.5 V14 H28.5 V29 L30.5 31.5 V35 Z" />
          <path d="M16.5 29 H28.5" fill="none" />
        </>
      );
      break;
    case 'n':
      body = (
        <>
          <path d="M28 35 C28.5 28.5 31 25.5 31 20.5 C31 14.5 27 10.5 21.5 10.5 L20.5 7 L18.8 10.9 C15.4 12.1 13.5 15 13.2 18.2 C13.1 19.4 13.7 20.5 14.8 21 L17.8 22.4 C18.6 22.8 19.6 22.6 20.2 21.9 L21.5 20.5 C22 22.5 21 24 19.5 25.8 C18 27.7 17.3 30.8 17.2 35 Z" />
          <circle cx="18.6" cy="15.4" r="1" style={{ fill: stroke }} stroke="none" />
        </>
      );
      break;
    case 'b':
      body = (
        <>
          {/* Шарик сверху, «митра» остриём вверх (широкая в середине, не внизу),
              узкий воротник и расклешённая ножка — классический силуэт слона. */}
          <circle cx="22.5" cy="7.3" r="2.2" />
          <path d="M22.5 10.5 C26.5 13 28.5 16.5 28.5 20 C28.5 23.8 26 26.3 22.5 26.3 C19 26.3 16.5 23.8 16.5 20 C16.5 16.5 18.5 13 22.5 10.5 Z" />
          <path d="M22.5 14 V19" fill="none" />
          <path d="M19.8 26.3 L19 29 H26 L25.2 26.3 Z" />
          <path d="M18 35 L19 29 H26 L27 35 Z" />
        </>
      );
      break;
    case 'q':
      body = (
        <>
          <circle cx="9.5" cy="14" r="2" />
          <circle cx="16" cy="11" r="2" />
          <circle cx="22.5" cy="10" r="2" />
          <circle cx="29" cy="11" r="2" />
          <circle cx="35.5" cy="14" r="2" />
          <path d="M11 16.5 C13 20.5 14 23.5 14.5 26.5 H30.5 C31 23.5 32 20.5 34 16.5 L28.8 21.8 L22.5 13.2 L16.2 21.8 Z" />
          <path d="M14.5 26.5 C15 30 16.5 31 16.5 33 L16.2 35 H28.8 L28.5 33 C28.5 31 30 30 30.5 26.5 Z" />
        </>
      );
      break;
    case 'k':
      body = (
        <>
          <path d="M21.2 4.5 H23.8 V7.2 H26.5 V9.8 H23.8 V12.5 H21.2 V9.8 H18.5 V7.2 H21.2 Z" />
          <path d="M15.5 35 L16 24.5 C16 18.5 19.5 15.5 22.5 15.5 C25.5 15.5 29 18.5 29 24.5 L29.5 35 Z" />
          <path d="M16.4 29.5 H28.6" fill="none" />
        </>
      );
      break;
  }

  return (
    <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <g style={style}>
        {body}
        {base}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// «Минимал» — плоские геометрические силуэты.
// ---------------------------------------------------------------------------

function MinimalPiece({ type, fill, stroke, ...rest }: RenderProps) {
  const style: CSSProperties = {
    fill,
    stroke,
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const base = <rect x="13.5" y="35" width="18" height="4.5" rx="2" />;

  let body: ReactNode;
  switch (type) {
    case 'p':
      body = (
        <>
          <circle cx="22.5" cy="14.5" r="5.5" />
          <path d="M18 35 L20.5 20 H24.5 L27 35 Z" />
        </>
      );
      break;
    case 'r':
      body = (
        <path d="M15.5 35 V12 H18.5 V15.5 H21 V12 H24 V15.5 H26.5 V12 H29.5 V35 Z" />
      );
      break;
    case 'n':
      body = (
        <path d="M27.5 35 V25 C32.5 23 33.5 15.5 28.5 12 L26.5 8.5 C24.5 8 23 9 22.5 11 L15.5 18.5 C14 20.5 15 23 17.5 22.5 L21.5 21 C21.5 25.5 19.5 27.5 18.5 35 Z" />
      );
      break;
    case 'b':
      body = (
        <>
          <circle cx="22.5" cy="7.5" r="2" />
          <path d="M22.5 11 C27.5 16 28.5 19.5 28.5 23 C28.5 27.5 26 29.5 22.5 29.5 C19 29.5 16.5 27.5 16.5 23 C16.5 19.5 17.5 16 22.5 11 Z" />
          <path d="M19.5 35 L20.5 29.5 H24.5 L25.5 35 Z" />
        </>
      );
      break;
    case 'q':
      body = (
        <>
          <path d="M14.5 20 L17.5 12.5 L20.5 17.5 L22.5 9.5 L24.5 17.5 L27.5 12.5 L30.5 20 L28.5 25 H16.5 Z" />
          <path d="M18 35 L18.5 25 H26.5 L27 35 Z" />
        </>
      );
      break;
    case 'k':
      body = (
        <>
          <path d="M21 5.5 H24 V8.5 H27 V11.5 H24 V14.5 H21 V11.5 H18 V8.5 H21 Z" />
          <path d="M17 35 L17.5 21.5 C17.5 16.5 27.5 16.5 27.5 21.5 L28 35 Z" />
        </>
      );
      break;
  }

  return (
    <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <g style={style}>
        {body}
        {base}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// «Классика» — Стаунтон. Геометрия вынесена в classicBody, чтобы её
// переиспользовал набор «Объём» (та же форма + тень и блик).
// ---------------------------------------------------------------------------

function classicBody(type: PieceType, stroke: string): ReactNode {
  switch (type) {
    case 'p':
      return (
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
      );
    case 'r':
      return (
        <>
          <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5l-3 3v12.5l3 1.5v3H11v-3l3-1.5V17z" />
          <path d="M14 17h17M14 28.5h17M14 25h17M11 14h23" fill="none" />
        </>
      );
    case 'n':
      return (
        <>
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          <circle cx="14.5" cy="20.5" r=".7" style={{ fill: stroke }} stroke="none" />
          <path d="M19.93 16.62l-.94 1.94" fill="none" style={{ stroke }} />
        </>
      );
    case 'b':
      // Геометрия слона — по мотивам набора cburnett (открытая лицензия,
      // используется на lichess): луковица с крестом, кольца-воротники, «лапки».
      return (
        <>
          <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z" />
          <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" />
          <path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z" />
          <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" />
        </>
      );
    case 'q':
      return (
        <>
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="14" cy="9" r="2" />
          <circle cx="22.5" cy="8" r="2" />
          <circle cx="31" cy="9" r="2" />
          <circle cx="39" cy="12" r="2" />
        </>
      );
    case 'k':
      return (
        <>
          <path d="M22.5 11.63V6M20 8h5" fill="none" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
        </>
      );
  }
}

function ClassicPiece({ type, fill, stroke, ...rest }: RenderProps) {
  const style: CSSProperties = {
    fill,
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  return (
    <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <g style={style}>{classicBody(type, stroke)}</g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// «Объём» — классические формы с тенью и градиентным бликом (псевдо-3D).
// ---------------------------------------------------------------------------

function VolumePiece({ type, fill, stroke, ...rest }: RenderProps) {
  // useId — чтобы id градиента не конфликтовали между фигурами на странице.
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { style: extStyle, ...others } = rest;
  const baseStyle: CSSProperties = {
    fill,
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  return (
    <svg
      viewBox="0 0 45 45"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 1.6px 1.1px rgba(0,0,0,0.45))', ...extStyle }}
      {...others}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <g style={baseStyle}>{classicBody(type, stroke)}</g>
      {/* Слой-блик той же геометрией поверх — даёт «объём». */}
      <g style={{ fill: `url(#${gid})`, stroke: 'none' }} pointerEvents="none">
        {classicBody(type, stroke)}
      </g>
    </svg>
  );
}
