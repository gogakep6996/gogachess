-- Убираем сообщества (группы, их чат, заявки) и личную переписку между
-- пользователями. Общение на платформе остаётся только внутри урока, где есть
-- учитель. Раздел «Друзья» (таблица "Friendship") сохранён.
--
-- ВНИМАНИЕ: миграция удаляет накопленные сообщения безвозвратно.
-- Перед применением на проде обязателен дамп: pg_dump.
--
-- Везде IF EXISTS: часть таблиц на разных стендах создавалась через
-- `prisma db push` и в истории миграций не числится, поэтому их может не быть.
-- Синтаксис PostgreSQL — на проде провайдер postgresql.

-- Сначала зависимые таблицы, потом сама группа.
DROP TABLE IF EXISTS "GroupMessage";
DROP TABLE IF EXISTS "GroupJoinRequest";
DROP TABLE IF EXISTS "GroupMember";
DROP TABLE IF EXISTS "DirectMessage";

-- Турниры групп становятся обычными публичными: связь снимаем, сами турниры
-- и их партии не трогаем.
ALTER TABLE "Tournament" DROP CONSTRAINT IF EXISTS "Tournament_groupId_fkey";
DROP INDEX IF EXISTS "Tournament_groupId_startsAt_idx";
ALTER TABLE "Tournament" DROP COLUMN IF EXISTS "groupId";

DROP TABLE IF EXISTS "Group";

-- Сортировка списка турниров по дате осталась, индекс под неё нужен отдельно:
-- раньше он был составным вместе с groupId.
CREATE INDEX IF NOT EXISTS "Tournament_startsAt_idx" ON "Tournament"("startsAt");
