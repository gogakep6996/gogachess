import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Доска — цвета взяты из реального скриншота шахматной партии
        board: {
          light: '#f0d9b5',
          dark: '#b58863',
          highlight: '#f7ec74',
          move: '#cdd26a',
          selected: '#bcd07b',
          danger: '#d96c6c',
        },
        // Бренд — глубокий «шахматный» зелёный: цвет доски, спокойствия и
        // концентрации. Насыщенность приглушена, чтобы сочетаться с тёплыми
        // нейтралами фона. Белый текст на brand-500/600 проходит WCAG AA.
        brand: {
          50: '#eef6f1',
          100: '#d6ebdf',
          200: '#aed6c2',
          300: '#7dbb9e',
          400: '#4b9d77',
          500: '#2b7f5c',
          600: '#226848',
          700: '#1c533b',
          800: '#174231',
          900: '#123528',
        },
        // Янтарный акцент — преемственность со старым брендом (#c97a1d).
        // Только для мелких акцентов: бейджи, подсветка, редкие CTA.
        accent: {
          50: '#fdf7ee',
          100: '#f8e9cf',
          200: '#f0d09b',
          300: '#e6b266',
          400: '#dc9438',
          500: '#c97a1d',
          600: '#a55f15',
          700: '#824817',
          800: '#5f3613',
          900: '#3e240e',
        },
        // Фон страницы: тёплая «бумажная» основа. Тёмная тема — глубокий
        // зеленовато-графитовый (не чёрный).
        surface: {
          light: '#f4f3ee',
          DEFAULT: '#eeece5',
          dark: '#131815',
          deeper: '#0c100d',
        },
        // Карточки/панели: чистый белый поверх тёплого фона — блоки мягко
        // «всплывают». В тёмной теме — приподнятый зелено-графитовый.
        paper: {
          DEFAULT: '#ffffff',
          dark: '#1b221e',
        },
      },
      fontFamily: {
        // Единый шрифт на весь сайт (текст + заголовки) — переменная задаётся
        // next/font в layout.tsx (Onest, полная кириллица).
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Тени тонированы под оттенок фона/акцента, без чисто-чёрных.
        soft: '0 10px 30px -14px rgba(35, 48, 40, 0.18)',
        glow: '0 0 0 1px rgba(43, 127, 92, 0.30), 0 12px 30px -10px rgba(43, 127, 92, 0.35)',
      },
      backgroundImage: {
        'wood-grain':
          'radial-gradient(at 30% 20%, #f7f5ec 0, transparent 50%), radial-gradient(at 80% 80%, #d9e2d3 0, transparent 55%)',
        'night-grain':
          'radial-gradient(at 30% 20%, #1c241f 0, transparent 50%), radial-gradient(at 80% 80%, #121814 0, transparent 55%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        pulseRing: 'pulseRing 1.4s ease-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(43,127,92,0.55)' },
          '100%': { boxShadow: '0 0 0 12px rgba(43,127,92,0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
