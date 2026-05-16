'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/** Measurement ID Google Analytics 4. */
export const GOOGLE_ANALYTICS_ID = 'G-DB6L4F5PXW';

type GtagFn = (...args: unknown[]) => void;

/**
 * Сообщает GA4 о каждом SPA-переходе. Без этого считались бы только
 * первоначальные загрузки страниц, а кликабельные переходы в App Router — нет.
 */
function GoogleAnalyticsRouteListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { gtag?: GtagFn };
    if (typeof w.gtag !== 'function') return;
    const qs = searchParams?.toString();
    const url = pathname + (qs ? `?${qs}` : '');
    w.gtag('config', GOOGLE_ANALYTICS_ID, { page_path: url });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Подключается один раз в корневом layout. Скрипт gtag.js грузится асинхронно,
 * после интерактивности — не влияет на LCP и FID.
 */
export function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ANALYTICS_ID}');
        `}
      </Script>

      <Suspense fallback={null}>
        <GoogleAnalyticsRouteListener />
      </Suspense>
    </>
  );
}
