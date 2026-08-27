import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { AnalyticsGate } from '@/components/analytics/AnalyticsGate';
import { CookieConsent } from '@/components/legal/CookieConsent';
import { VersionWatcher } from '@/components/system/VersionWatcher';
import { buildBoardThemeCss, BOARD_THEME_KEY, PIECE_THEME_KEY } from '@/lib/board-theme';
import { PieceSetHydrator } from '@/components/ui/PieceSetHydrator';

// Единый шрифт на весь сайт (текст и заголовки) — самохостится Next.js при
// сборке (без внешних запросов к Google Fonts, без сдвига layout при загрузке).
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = (process.env.SITE_URL || 'https://gogachess.ru').replace(/\/$/, '');
const SITE_TITLE = 'gogachess — шахматы для обучения';
const SITE_DESCRIPTION =
  'Интерактивные шахматные уроки с доской, чатом и аудиосвязью. Играйте онлайн, ведите классы и устраивайте турниры в браузере.';

export const metadata: Metadata = {
  // Нужен, чтобы относительные пути (например, /opengraph-image) превращались
  // в абсолютные URL в og:image / twitter:image.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // Дочерние страницы могут задать свой `title` — он подставится как "X | gogachess".
    template: '%s | gogachess',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'gogachess',
  keywords: [
    'шахматы',
    'шахматы онлайн',
    'обучение шахматам',
    'шахматные уроки',
    'тренер по шахматам',
    'шахматный класс',
    'играть в шахматы',
    'турниры по шахматам',
    'Stockfish',
    'gogachess',
  ],
  authors: [{ name: 'gogachess' }],
  creator: 'gogachess',
  publisher: 'gogachess',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: 'gogachess',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:image добавится автоматически из src/app/opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Запрещает iOS-Safari «наезжать» зумом на поле ввода при фокусе (чат и т.п.).
  // Пинч-зум пальцами при этом остаётся доступен (iOS 10+ игнорирует ограничение
  // для жестов пользователя, но уважает его для авто-зума на инпутах).
  maximumScale: 1,
  themeColor: '#c9c5b1',
};

const themeBootstrap = `
(function(){try{
  var s = localStorage.getItem('chessclass-theme');
  if(!s){ s = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  if(s === 'dark') document.documentElement.classList.add('dark');
  var b = localStorage.getItem('${BOARD_THEME_KEY}');
  if(b) document.documentElement.setAttribute('data-board-theme', b);
  var p = localStorage.getItem('${PIECE_THEME_KEY}');
  if(p) document.documentElement.setAttribute('data-piece-theme', p);
}catch(e){}})();
`.trim();

// CSS-переменные всех тем доски — генерируются на сервере один раз.
const boardThemeCss = buildBoardThemeCss();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={inter.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: boardThemeCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Применяет сохранённый набор фигур (форму) после монтирования. */}
        <PieceSetHydrator />
        {/* Наблюдает за версией сервера. При новой сборке показывает баннер */}
        {/* "Доступно обновление" — пользователю не нужно жать Ctrl+Shift+R. */}
        <VersionWatcher />
        {/* Баннер согласия на cookie (152-ФЗ). Пока пользователь не согласился — */}
        {/* аналитика не грузится. */}
        <CookieConsent />
        {/* Яндекс.Метрика подключается на всём сайте, но ТОЛЬКО после согласия */}
        {/* на cookie. */}
        <AnalyticsGate />
      </body>
    </html>
  );
}
