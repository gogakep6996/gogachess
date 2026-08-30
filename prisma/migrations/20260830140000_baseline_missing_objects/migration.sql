-- Догоняющая миграция: приводит журнал миграций в соответствие с schema.prisma.
--
-- Зачем. Часть таблиц создавалась командой `prisma db push`, а не миграциями,
-- и в журнале не числилась. Работало это только потому, что контейнер при каждом
-- старте выполнял `db push --accept-data-loss` — команду, которая приводит базу
-- к схеме и молча удаляет всё лишнее. Под удар попадали именно те данные, что
-- дороже всего: папки библиотеки, папки домашних заданий и попытки учеников.
--
-- Что здесь. Восемь таблиц, две колонки и один индекс, которых не хватало
-- в истории. SQL сгенерирован из schema.prisma, не написан руками.
--
-- Безопасность. Каждый шаг идемпотентен: на боевой базе все эти объекты уже
-- существуют, поэтому миграция там ничего не создаёт и ничего не трогает —
-- просто отмечается как применённая. На чистой базе она создаёт недостающее.
-- Ни одной удаляющей команды в файле нет.

-- ── Колонки, добавленные когда-то через db push ──

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "TaskSession" ADD COLUMN IF NOT EXISTS "context" TEXT NOT NULL DEFAULT 'lesson';

-- ── Таблицы ──

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HomeworkFolder" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HomeworkFolderTask" (
    "folderId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkFolderTask_pkey" PRIMARY KEY ("folderId","taskId")
);

CREATE TABLE IF NOT EXISTS "LibraryFolder" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LibraryFolderTask" (
    "folderId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryFolderTask_pkey" PRIMARY KEY ("folderId","taskId")
);

CREATE TABLE IF NOT EXISTS "TaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "movesPlayed" INTEGER NOT NULL DEFAULT 0,
    "startFen" TEXT,
    "moves" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solvedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- ── Индексы ──

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthToken_userId_kind_idx" ON "AuthToken"("userId", "kind");
CREATE INDEX IF NOT EXISTS "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

CREATE INDEX IF NOT EXISTS "HomeworkFolder_classId_position_idx" ON "HomeworkFolder"("classId", "position");
CREATE INDEX IF NOT EXISTS "HomeworkFolderTask_taskId_idx" ON "HomeworkFolderTask"("taskId");

CREATE INDEX IF NOT EXISTS "LibraryFolder_classId_position_idx" ON "LibraryFolder"("classId", "position");
CREATE INDEX IF NOT EXISTS "LibraryFolderTask_taskId_idx" ON "LibraryFolderTask"("taskId");

CREATE INDEX IF NOT EXISTS "TaskAttempt_taskId_userId_idx" ON "TaskAttempt"("taskId", "userId");
CREATE INDEX IF NOT EXISTS "TaskAttempt_taskId_status_idx" ON "TaskAttempt"("taskId", "status");
CREATE INDEX IF NOT EXISTS "TaskAttempt_userId_idx" ON "TaskAttempt"("userId");

CREATE INDEX IF NOT EXISTS "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
CREATE INDEX IF NOT EXISTS "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskSession_taskId_userId_context_key" ON "TaskSession"("taskId", "userId", "context");

-- ── Внешние ключи ──
-- В PostgreSQL у ADD CONSTRAINT нет IF NOT EXISTS, поэтому наличие проверяем сами.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthToken_userId_fkey') THEN
    ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkFolder_classId_fkey') THEN
    ALTER TABLE "HomeworkFolder" ADD CONSTRAINT "HomeworkFolder_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkFolderTask_folderId_fkey') THEN
    ALTER TABLE "HomeworkFolderTask" ADD CONSTRAINT "HomeworkFolderTask_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "HomeworkFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkFolderTask_taskId_fkey') THEN
    ALTER TABLE "HomeworkFolderTask" ADD CONSTRAINT "HomeworkFolderTask_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LibraryFolder_classId_fkey') THEN
    ALTER TABLE "LibraryFolder" ADD CONSTRAINT "LibraryFolder_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LibraryFolderTask_folderId_fkey') THEN
    ALTER TABLE "LibraryFolderTask" ADD CONSTRAINT "LibraryFolderTask_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "LibraryFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LibraryFolderTask_taskId_fkey') THEN
    ALTER TABLE "LibraryFolderTask" ADD CONSTRAINT "LibraryFolderTask_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttempt_taskId_fkey') THEN
    ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttempt_userId_fkey') THEN
    ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Friendship_requesterId_fkey') THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey"
      FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Friendship_addresseeId_fkey') THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey"
      FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
