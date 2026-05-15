-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "Song_batchId_idx" ON "Song"("batchId");
