#!/usr/bin/env bash
# Обновление gogachess на VPS. Запускайте из каталога проекта:
#   bash scripts/deploy.sh
set -euo pipefail

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci

echo "==> prisma migrate / generate"
# Для PostgreSQL миграции, для SQLite — db push.
if grep -q '^DATABASE_URL="postgresql' .env 2>/dev/null; then
  npx prisma migrate deploy
else
  npx prisma db push
fi
npx prisma generate

echo "==> next build"
npm run build

echo "==> pm2 reload"
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
  pm2 save
else
  echo "PM2 не найден, перезапустите сервер вручную."
fi

echo "==> done"
