-- AlterTable: добавляем флаг «домашнее задание» к задачам класса.
ALTER TABLE "Task" ADD COLUMN "isHomework" BOOLEAN NOT NULL DEFAULT false;
