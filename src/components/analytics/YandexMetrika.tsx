'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/** ID счётчика Яндекс.Метрики. Здесь же — чтобы не задавать в нескольких местах. */
export const YANDEX_METRIKA_ID = 109253347;

type YmFn = (counterId: number, action: string, ...rest: unknown[]) => void;

/**
 * Сообщает Метрике о каждой клиентской навигации (App Router не перезагружает страницу,
 * поэтому без этого SPA-переходы не считаются как просмотры).
 */
function YandexMetrikaRouteListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { ym?: YmFn };
    if (typeof w.ym !== 'function') return;
    const qs = searchParams?.toString();
    const url = pathname + (qs ? `?${qs}` : '');
    w.ym(YANDEX_METRIKA_ID, 'hit', url, {
      referer: typeof document !== 'undefined' ? document.referrer : '',
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Подключается один раз в корневом layout — счётчик начинает работать на всех страницах.
 * Скрипт грузится после интерактивности (strategy="afterInteractive"), чтобы не блокировать LCP.
 */
export function YandexMetrika() {
  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {
              if (document.scripts[j].src === r) { return; }
            }
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');

          ym(${YANDEX_METRIKA_ID}, 'init', {
            ssr: true,
            webvisor: true,
            clickmap: true,
            ecommerce: "dataLayer",
            accurateTrackBounce: true,
            trackLinks: true
          });
        `}
      </Script>

      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>

      <Suspense fallback={null}>
        <YandexMetrikaRouteListener />
      </Suspense>
    </>
  );
}
