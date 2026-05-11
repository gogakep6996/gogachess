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
    },
  },
};

export default nextConfig;
