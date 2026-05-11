import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';

export const metadata: Metadata = {
  title: 'gogachess — шахматы для обучения',
  description: 'Интерактивные шахматные уроки с доской, чатом и аудиосвязью',
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
      </body>
    </html>
  );
}
