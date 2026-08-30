# =====================================================================
# gogachess — production-образ Next.js + Socket.IO в одном контейнере.
# Multi-stage: deps -> build -> runner.
# =====================================================================

ARG NODE_VERSION=20-alpine

# ---------- 1. Зависимости ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

# ---------- 2. Сборка ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1
# Переменные NEXT_PUBLIC_* Next.js подставляет в клиентский бандл на сборке —
# при запуске контейнера они уже не читаются. Файл .env в образ не попадает
# (он в .dockerignore), поэтому значения приходят аргументами из docker-compose.
# Без клиентского ключа виджет SmartCaptcha собирается пустым, и проверки
# «я не бот» на сайте фактически нет.
ARG NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY=""
ARG NEXT_PUBLIC_ICE_SERVERS=""
ENV NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY=${NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY}
ENV NEXT_PUBLIC_ICE_SERVERS=${NEXT_PUBLIC_ICE_SERVERS}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# schema.prisma нужен и сборке, и рантайму. Каталог prisma/migrations обязателен:
# схему на сервере меняют только миграции, без них база не обновится.
RUN ls -la prisma/migrations \
 && npx prisma generate \
 && npm run build

# ---------- 3. Runtime ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Копируем минимум для запуска
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.server.json ./tsconfig.server.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# Схему меняют только миграции. Раньше здесь дополнительно выполнялся
# `db push --accept-data-loss` — он приводил базу к schema.prisma и молча удалял
# всё, что в схему не попало: папки библиотеки, домашки, попытки учеников.
#
# `set -eu` вместо прежнего `set +e`: если миграция не применилась, контейнер
# должен остановиться с ошибкой в логах. Работать на несинхронной схеме хуже,
# чем не подняться: именно проглоченные ошибки скрывали поломку журнала миграций
# больше года, пока всю работу за migrate deploy делал db push.
CMD ["sh", "-c", "set -eu; echo '[gogachess] prisma migrate deploy'; npx prisma migrate deploy; echo '[gogachess] starting node'; exec node ./node_modules/tsx/dist/cli.mjs server/index.ts"]
