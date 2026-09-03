-- Арена вместо турниров.
--
-- Зачем. Старый раздел турниров переписан с нуля: формат теперь один — арена
-- (непрерывный подбор пар на отведённое время, как на lichess). Прежние таблицы
-- под него не подходят, и в них накопились ошибки, дороже которых их починка.
--
-- Что удаляется. Tournament, TournamentPlayer, TournamentMatch вместе с
-- содержимым. Владелец подтвердил: на проде в турниры никто не играл, ценных
-- данных там нет. Партии старых турниров жили в таблице Room и в схеме больше
-- не числятся, но строки Room этой миграцией НЕ удаляются: в Room лежат все
-- уроки сайта, а лишние строки с kind='tournament' нигде не показываются
-- (страница /rooms фильтрует kind='lesson') и ни на что не влияют. Трогать
-- живую таблицу без нужды опаснее, чем оставить пару мёртвых строк.
--
-- ВАЖНО про порядок. Сначала снимается внешний ключ Room → Tournament, и только
-- потом удаляются турнирные таблицы. В обратном порядке PostgreSQL откажется
-- удалять Tournament, на которую ещё ссылается Room, и миграция упадёт.
--
-- Перед применением на проде нужен свежий дамп: миграция меняет таблицу Room,
-- в которой живут уроки. См. .cursor/rules/database-safety.mdc.

-- ── 1. Снимаем связь Room → Tournament ──────────────────────────────────────
-- Уходит только колонка привязки. Сами комнаты и их содержимое остаются.

ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_tournamentId_fkey";
ALTER TABLE "Room" DROP COLUMN IF EXISTS "tournamentId";

-- ── 2. Удаляем турнирные таблицы ────────────────────────────────────────────
-- Порядок от зависимых к главной: TournamentMatch ссылается на Tournament и Room,
-- TournamentPlayer — на Tournament.

DROP TABLE IF EXISTS "TournamentMatch";
DROP TABLE IF EXISTS "TournamentPlayer";
DROP TABLE IF EXISTS "Tournament";

-- ── 3. Создаём таблицы арены ────────────────────────────────────────────────

CREATE TABLE "Arena" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeControl" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "accessCode" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Arena_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArenaPlayer" (
    "id" TEXT NOT NULL,
    "arenaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "whiteGames" INTEGER NOT NULL DEFAULT 0,
    "blackGames" INTEGER NOT NULL DEFAULT 0,
    "lastOpponentId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ready',
    "scoredAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArenaGame" (
    "id" TEXT NOT NULL,
    "arenaId" TEXT NOT NULL,
    "whiteId" TEXT NOT NULL,
    "blackId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'live',
    "reason" TEXT,
    "fen" TEXT NOT NULL,
    "moves" TEXT NOT NULL DEFAULT '[]',
    "whiteMs" INTEGER NOT NULL,
    "blackMs" INTEGER NOT NULL,
    "turnStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ArenaGame_pkey" PRIMARY KEY ("id")
);

-- ── 4. Индексы ──────────────────────────────────────────────────────────────

CREATE INDEX "Arena_status_startsAt_idx" ON "Arena"("status", "startsAt");
CREATE INDEX "Arena_startsAt_idx" ON "Arena"("startsAt");

CREATE UNIQUE INDEX "ArenaPlayer_arenaId_userId_key" ON "ArenaPlayer"("arenaId", "userId");
CREATE INDEX "ArenaPlayer_arenaId_score_idx" ON "ArenaPlayer"("arenaId", "score");

CREATE INDEX "ArenaGame_arenaId_status_idx" ON "ArenaGame"("arenaId", "status");
CREATE INDEX "ArenaGame_arenaId_startedAt_idx" ON "ArenaGame"("arenaId", "startedAt");

-- ── 5. Внешние ключи ────────────────────────────────────────────────────────

ALTER TABLE "Arena" ADD CONSTRAINT "Arena_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArenaPlayer" ADD CONSTRAINT "ArenaPlayer_arenaId_fkey"
    FOREIGN KEY ("arenaId") REFERENCES "Arena"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArenaPlayer" ADD CONSTRAINT "ArenaPlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArenaGame" ADD CONSTRAINT "ArenaGame_arenaId_fkey"
    FOREIGN KEY ("arenaId") REFERENCES "Arena"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArenaGame" ADD CONSTRAINT "ArenaGame_whiteId_fkey"
    FOREIGN KEY ("whiteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArenaGame" ADD CONSTRAINT "ArenaGame_blackId_fkey"
    FOREIGN KEY ("blackId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
