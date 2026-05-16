import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { YandexMetrika } from '@/components/analytics/YandexMetrika';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';

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
  themeColor: '#f3ead9',
};

const themeBootstrap = `
(function(){try{
  var s = localStorage.getItem('chessclass-theme');
  if(!s){ s = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  if(s === 'dark') document.documentElement.classList.add('dark');
}catch(e){}})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Аналитика подключается один раз для всего сайта — присутствует на любой странице, */}
        {/* включая создаваемые в будущем, без необходимости править каждую страницу отдельно. */}
        <YandexMetrika />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
