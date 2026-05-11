// Шахматные фигуры в стиле классического Стаунтона.
// Это компактный, лицензионно чистый набор, нарисованный с нуля под цвета доски из референса.
// Использует только path/fill — отлично масштабируется и легко перекрашивается через CSS.

import type { SVGProps } from 'react';

export type PieceColor = 'w' | 'b';
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type PieceCode = `${PieceColor}${PieceType}`;

interface Props extends SVGProps<SVGSVGElement> {
  code: PieceCode;
}

export function PieceSvg({ code, ...rest }: Props) {
  const color = code[0] as PieceColor;
  const type = code[1] as PieceType;
  const fill = color === 'w' ? '#fbf6ee' : '#1f1a14';
  const stroke = color === 'w' ? '#1f1a14' : '#000';

  const common = {
    viewBox: '0 0 45 45',
    xmlns: 'http://www.w3.org/2000/svg',
    ...rest,
  };

  const sw = 1.6;
  const baseStyle = { fill, stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (type) {
    case 'p':
      return (
        <svg {...common}>
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            {...baseStyle}
          />
        </svg>
      );
    case 'r':
      return (
        <svg {...common}>
          <g {...baseStyle}>
            <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5l-3 3v12.5l3 1.5v3H11v-3l3-1.5V17z" />
            <path d="M14 17h17M14 28.5h17M14 25h17M11 14h23" fill="none" />
          </g>
        </svg>
      );
    case 'n':
      return (
        <svg {...common}>
          <g {...baseStyle}>
            <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
            <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
            <circle cx="14.5" cy="20.5" r=".7" fill={stroke} stroke="none" />
            <path d="M19.93 16.62l-.94 1.94" fill="none" stroke={stroke} />
          </g>
        </svg>
      );
    case 'b':
      return (
        <svg {...common}>
          <g {...baseStyle}>
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M22.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" transform="translate(0,2.5)" />
            <path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none" />
          </g>
        </svg>
      );
    case 'q':
      return (
        <svg {...common}>
          <g {...baseStyle}>
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
            <circle cx="6" cy="12" r="2" />
            <circle cx="14" cy="9" r="2" />
            <circle cx="22.5" cy="8" r="2" />
            <circle cx="31" cy="9" r="2" />
            <circle cx="39" cy="12" r="2" />
          </g>
        </svg>
      );
    case 'k':
      return (
        <svg {...common}>
          <g {...baseStyle}>
            <path d="M22.5 11.63V6M20 8h5" fill="none" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
            <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
          </g>
        </svg>
      );
  }
}
