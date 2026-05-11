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
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
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
# Сначала миграции (создаст таблицы при первом старте), потом сервер
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push --accept-data-loss && node ./node_modules/tsx/dist/cli.mjs server/index.ts"]
