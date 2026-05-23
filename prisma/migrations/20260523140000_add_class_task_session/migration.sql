-- CreateTable: Class
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "accessCode" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Task
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fen" TEXT NOT NULL,
    "sideToPlay" TEXT NOT NULL DEFAULT 'w',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "goal" TEXT NOT NULL DEFAULT 'mate',
    "engineLevel" INTEGER NOT NULL DEFAULT 10,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TaskSession
CREATE TABLE "TaskSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fen" TEXT NOT NULL,
    "movesPlayed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "solvedAt" TIMESTAMP(3),

    CONSTRAINT "TaskSession_pkey" PRIMARY KEY ("id")
);

-- Indexes / Unique constraints
CREATE UNIQUE INDEX "Class_ownerId_key" ON "Class"("ownerId");
CREATE UNIQUE INDEX "Class_slug_key" ON "Class"("slug");
CREATE INDEX "Task_classId_position_idx" ON "Task"("classId", "position");
CREATE UNIQUE INDEX "TaskSession_roomId_key" ON "TaskSession"("roomId");
CREATE UNIQUE INDEX "TaskSession_taskId_userId_key" ON "TaskSession"("taskId", "userId");
CREATE INDEX "TaskSession_taskId_status_idx" ON "TaskSession"("taskId", "status");

-- Foreign keys
ALTER TABLE "Class" ADD CONSTRAINT "Class_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
