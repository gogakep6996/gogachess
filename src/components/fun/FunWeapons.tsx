/**
 * SVG-оружие для боевых сцен «Развлекательных шахмат».
 * Каждое оружие нарисовано вертикально (остриё вверх, рукоять внизу) во
 * viewBox 40×120 (молот/трезубец — шире), чтобы вращение вокруг рукояти
 * (transform-origin у обёртки .fun-weapon) читалось как замах и удар.
 * Палитры различаются для армии Света (dark=false) и Тьмы (dark=true).
 */

import type { ReactElement } from 'react';

export type WeaponKind = 'sword' | 'greatsword' | 'hammer' | 'trident' | 'staff' | 'scepter';

/** Какое оружие достаёт фигура при взятии. */
export function weaponKindFor(piece: string, color: 'w' | 'b'): WeaponKind {
  switch (piece) {
    case 'r':
      return 'hammer'; // гном / злой гном
    case 'b':
      return 'staff'; // священник / некромант
    case 'q':
      return color === 'w' ? 'greatsword' : 'trident'; // архангел / демон
    case 'k':
      return 'scepter'; // король / король-лич
    default:
      return 'sword'; // пехотинец, скелет, рыцари
  }
}

export function WeaponSprite({ kind, dark }: { kind: WeaponKind; dark: boolean }): ReactElement {
  switch (kind) {
    case 'hammer':
      return <Hammer dark={dark} />;
    case 'staff':
      return <Staff dark={dark} />;
    case 'greatsword':
      return <Greatsword dark={dark} />;
    case 'trident':
      return <Trident dark={dark} />;
    case 'scepter':
      return <Scepter dark={dark} />;
    default:
      return <Sword dark={dark} />;
  }
}

function Sword({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-swd-d' : 'wpn-swd-l';
  const blade = dark ? ['#a1a1aa', '#3f3f46'] : ['#ffffff', '#94a3b8'];
  const edge = dark ? '#d4d4d8' : '#f8fafc';
  const guard = dark ? '#3f3f46' : '#d4a017';
  const grip = dark ? '#27272a' : '#7c2d12';
  return (
    <svg viewBox="0 0 40 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={blade[0]} />
          <stop offset="1" stopColor={blade[1]} />
        </linearGradient>
      </defs>
      <polygon points="20,2 27,16 26,76 14,76 13,16" fill={`url(#${id})`} stroke={dark ? '#18181b' : '#64748b'} strokeWidth="1" />
      <polygon points="20,6 22.5,16 21.5,74 18.5,74 17.5,16" fill={edge} opacity="0.75" />
      <rect x="7" y="75" width="26" height="7" rx="3" fill={guard} stroke="rgba(0,0,0,0.25)" />
      <rect x="16.5" y="82" width="7" height="26" rx="3" fill={grip} />
      <circle cx="20" cy="111" r="5.5" fill={guard} stroke="rgba(0,0,0,0.25)" />
      {dark && <circle cx="20" cy="111" r="2.4" fill="#dc2626" />}
    </svg>
  );
}

/** Огромный сияющий меч Архангела (у Тьмы не используется, но палитра есть). */
function Greatsword({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-gsw-d' : 'wpn-gsw-l';
  const blade = dark ? ['#e4e4e7', '#52525b'] : ['#fefce8', '#facc15'];
  const guard = dark ? '#3f3f46' : '#d4a017';
  return (
    <svg viewBox="0 0 40 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={blade[0]} />
          <stop offset="1" stopColor={blade[1]} />
        </linearGradient>
      </defs>
      <polygon points="20,0 30,16 28,78 12,78 10,16" fill={`url(#${id})`} stroke={dark ? '#18181b' : '#ca8a04'} strokeWidth="1" />
      <polygon points="20,5 23,16 21.5,76 18.5,76 17,16" fill="#ffffff" opacity="0.85" />
      {/* Крылья гарды */}
      <path d="M4 82 Q12 74 20 78 Q28 74 36 82 Q28 86 20 83 Q12 86 4 82 Z" fill={guard} stroke="rgba(0,0,0,0.25)" />
      <rect x="16.5" y="84" width="7" height="24" rx="3" fill={dark ? '#27272a' : '#e2e8f0'} />
      <circle cx="20" cy="112" r="6" fill={guard} />
      <circle cx="20" cy="112" r="2.8" fill={dark ? '#a78bfa' : '#60a5fa'} />
    </svg>
  );
}

function Hammer({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-ham-d' : 'wpn-ham-l';
  const head = dark ? ['#57534e', '#1c1917'] : ['#f5f5f4', '#78716c'];
  const band = dark ? '#7f1d1d' : '#d4a017';
  const grip = dark ? '#292524' : '#92400e';
  const stud = dark ? '#dc2626' : '#fbbf24';
  return (
    <svg viewBox="0 0 60 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={head[0]} />
          <stop offset="1" stopColor={head[1]} />
        </linearGradient>
      </defs>
      <rect x="26.5" y="32" width="7" height="80" rx="3" fill={grip} stroke="rgba(0,0,0,0.25)" />
      <rect x="8" y="5" width="44" height="32" rx="6" fill={`url(#${id})`} stroke="rgba(0,0,0,0.35)" />
      <rect x="8" y="12" width="44" height="4.5" rx="2" fill={band} opacity="0.9" />
      <rect x="8" y="26" width="44" height="4.5" rx="2" fill={band} opacity="0.9" />
      <circle cx="15" cy="21" r="2.2" fill={stud} />
      <circle cx="45" cy="21" r="2.2" fill={stud} />
      <rect x="24" y="108" width="12" height="6" rx="3" fill={dark ? '#44403c' : '#d4a017'} />
    </svg>
  );
}

/** Трезубец демона. */
function Trident({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-tri-d' : 'wpn-tri-l';
  const prong = dark ? ['#f4f4f5', '#3f3f46'] : ['#fef3c7', '#b45309'];
  const pole = dark ? '#450a0a' : '#7c2d12';
  const bar = dark ? '#991b1b' : '#b45309';
  return (
    <svg viewBox="0 0 48 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={prong[0]} />
          <stop offset="1" stopColor={prong[1]} />
        </linearGradient>
      </defs>
      <rect x="21.5" y="30" width="5" height="82" rx="2.5" fill={pole} stroke="rgba(0,0,0,0.3)" />
      {/* Центральное и боковые острия */}
      <polygon points="24,0 27.5,10 26.5,34 21.5,34 20.5,10" fill={`url(#${id})`} stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <polygon points="8,34 7,12 12,4 15,13 14,34" fill={`url(#${id})`} stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <polygon points="40,34 41,12 36,4 33,13 34,34" fill={`url(#${id})`} stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <rect x="6" y="32" width="36" height="5" rx="2.5" fill={bar} stroke="rgba(0,0,0,0.3)" />
      <circle cx="24" cy="114" r="4" fill={bar} />
    </svg>
  );
}

/** Посох с магической сферой: свет — золотая, тьма — ядовито-зелёная. */
function Staff({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-stf-d' : 'wpn-stf-l';
  const orb = dark ? ['#d9f99d', '#15803d'] : ['#fffbeb', '#f59e0b'];
  const glow = dark ? 'rgba(74, 222, 128, 0.45)' : 'rgba(251, 191, 36, 0.45)';
  const pole = dark ? '#1c1917' : '#a16207';
  return (
    <svg viewBox="0 0 40 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <radialGradient id={id} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor={orb[0]} />
          <stop offset="1" stopColor={orb[1]} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="17" r="15" fill={glow} />
      <rect x="17.5" y="24" width="5" height="88" rx="2.5" fill={pole} stroke="rgba(0,0,0,0.3)" />
      <circle cx="20" cy="17" r="10.5" fill={`url(#${id})`} stroke="rgba(0,0,0,0.25)" />
      {/* «Когти», держащие сферу */}
      <path d="M11 26 Q13 19 16 16 L14 25 Z" fill={pole} />
      <path d="M29 26 Q27 19 24 16 L26 25 Z" fill={pole} />
      <rect x="15" y="104" width="10" height="5" rx="2.5" fill={dark ? '#3f3f46' : '#d4a017'} />
    </svg>
  );
}

/** Скипетр короля: свет — золото с рубином, лич — сталь с ледяным самоцветом. */
function Scepter({ dark }: { dark: boolean }): ReactElement {
  const id = dark ? 'wpn-scp-d' : 'wpn-scp-l';
  const gem = dark ? ['#cffafe', '#0891b2'] : ['#fecaca', '#b91c1c'];
  const metal = dark ? '#3f3f46' : '#ca8a04';
  const accent = dark ? '#71717a' : '#facc15';
  return (
    <svg viewBox="0 0 40 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={gem[0]} />
          <stop offset="1" stopColor={gem[1]} />
        </linearGradient>
      </defs>
      <rect x="17.5" y="32" width="5" height="80" rx="2.5" fill={metal} stroke="rgba(0,0,0,0.3)" />
      {/* Коронка вокруг самоцвета */}
      <path d="M9 30 L12 18 L16 26 L20 14 L24 26 L28 18 L31 30 Z" fill={accent} stroke="rgba(0,0,0,0.25)" />
      <polygon points="20,8 28,20 20,32 12,20" fill={`url(#${id})`} stroke="rgba(0,0,0,0.3)" />
      <circle cx="20" cy="114" r="4.5" fill={metal} />
    </svg>
  );
}
