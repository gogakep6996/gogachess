import type { MetadataRoute } from 'next';

/**
 * Базовый URL берётся из env. Если не задан — берём прод-домен,
 * чтобы поисковикам уезжали корректные абсолютные ссылки.
 */
const SITE_URL = (process.env.SITE_URL || 'https://gogachess.ru').replace(/\/$/, '');

/**
 * Next.js автоматически отдаёт этот результат на /robots.txt.
 * Публичные страницы открыты для индексации; сервисные/приватные — запрещены.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Запрещаем индексировать всё, что либо за логином, либо служебное,
        // либо динамическое (комнаты, турниры, API).
        disallow: [
          '/api/',
          '/play',
          '/rooms',
          '/room/',
          '/tournaments',
          '/_next/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
