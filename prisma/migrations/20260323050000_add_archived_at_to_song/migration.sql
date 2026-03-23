-- AlterTable
ALTER TABLE "Song" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Song_userId_archivedAt_idx" ON "Song"("userId", "archivedAt");
