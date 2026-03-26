-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "timestamp" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Comment_songId_timestamp_idx" ON "Comment"("songId", "timestamp");
