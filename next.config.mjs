/** @type {import('next').NextConfig} */
const SITE_URL = process.env.SITE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';

const allowedOrigins = ['localhost:3000'];
if (SITE_URL) allowedOrigins.push(SITE_URL);

const nextConfig = {
  reactStrictMode: true,
  // standalone-сборка позволяет деплоить минимальным образом (Docker / VPS)
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins,
      // Стабильные ID Server Actions между пересборками: без этого после каждого
      // `docker compose build` клиенты с кешем падают с "Failed to find Server Action".
      // Сгенерировать ключ: `openssl rand -base64 32` и положить в .env.
      ...(process.env.SERVER_ACTIONS_ENCRYPTION_KEY
        ? { encryptionKey: process.env.SERVER_ACTIONS_ENCRYPTION_KEY }
        : {}),
    },
  },
};

export default nextConfig;
