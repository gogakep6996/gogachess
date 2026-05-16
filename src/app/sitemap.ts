import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.SITE_URL || 'https://gogachess.ru').replace(/\/$/, '');

/**
 * Next.js автоматически отдаёт результат на /sitemap.xml.
 * Включаем только публичные страницы, которые имеют смысл в выдаче.
 * Закрытые за логином (rooms, tournaments, room/[code]) и API — не добавляем.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/learn`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/analysis`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
