import { ImageResponse } from 'next/og';

/**
 * Превью для соцсетей (Telegram / WhatsApp / VK / Twitter / Facebook).
 * Next.js при сборке рендерит этот компонент в PNG и сам подставляет
 * <meta property="og:image"> и <meta name="twitter:image"> в <head>.
 */
export const runtime = 'nodejs';
export const alt = 'gogachess — шахматы для обучения';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3ead9',
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(178, 122, 60, 0.18) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(120, 78, 40, 0.18) 0%, transparent 55%)',
          fontFamily: 'system-ui, sans-serif',
          color: '#2a201a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginBottom: 26,
          }}
        >
          <div
            style={{
              width: 132,
              height: 132,
              backgroundColor: '#b27a3c',
              borderRadius: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 36px rgba(120, 78, 40, 0.35)',
            }}
          >
            {/* Та же фигура коня, что в логотипе в шапке — рисуем SVG-путём, */}
            {/* чтобы не зависеть от шрифтов и unicode-глифов. */}
            <svg width="84" height="84" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
              <path
                fill="#ffffff"
                d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
              />
            </svg>
          </div>
          <div
            style={{
              fontSize: 132,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            gogachess
          </div>
        </div>
        <div
          style={{
            fontSize: 44,
            color: '#5b4a36',
            fontWeight: 500,
            textAlign: 'center',
            maxWidth: 940,
          }}
        >
          Шахматы для обучения — играть, вести уроки и устраивать турниры в браузере
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 38,
            fontSize: 28,
            color: '#7c6850',
            letterSpacing: 1,
          }}
        >
          gogachess.ru
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
