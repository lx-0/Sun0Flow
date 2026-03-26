/*
  Warnings:

  - You are about to drop the column `searchVector` on the `Song` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Song_searchVector_idx";

-- AlterTable
ALTER TABLE "Song" DROP COLUMN "searchVector";

-- CreateTable
CREATE TABLE "PlayEvent" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "listenerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" DOUBLE PRECISION,

    CONSTRAINT "PlayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayEvent_songId_startedAt_idx" ON "PlayEvent"("songId", "startedAt");

-- CreateIndex
CREATE INDEX "PlayEvent_listenerId_startedAt_idx" ON "PlayEvent"("listenerId", "startedAt");

-- AddForeignKey
ALTER TABLE "PlayEvent" ADD CONSTRAINT "PlayEvent_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
