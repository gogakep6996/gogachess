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
        // Бренд — тёплый янтарь поверх кофейного фона
        brand: {
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
        surface: {
          light: '#fbf6ee',
          DEFAULT: '#f3ead9',
          dark: '#161310',
          deeper: '#0c0a08',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(60, 35, 10, 0.25)',
        glow: '0 0 0 1px rgba(201, 122, 29, 0.35), 0 12px 30px -10px rgba(201, 122, 29, 0.45)',
      },
      backgroundImage: {
        'wood-grain':
          'radial-gradient(at 30% 20%, #f7e7c5 0, transparent 50%), radial-gradient(at 80% 80%, #d6b07c 0, transparent 55%)',
        'night-grain':
          'radial-gradient(at 30% 20%, #2a2218 0, transparent 50%), radial-gradient(at 80% 80%, #1b140d 0, transparent 55%)',
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
          '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,0.55)' },
          '100%': { boxShadow: '0 0 0 12px rgba(34,197,94,0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
