-- AlterTable: make songId optional on Report, add playlistId
ALTER TABLE "Report" ALTER COLUMN "songId" DROP NOT NULL;

ALTER TABLE "Report" ADD COLUMN "playlistId" TEXT;

-- CreateIndex
CREATE INDEX "Report_playlistId_idx" ON "Report"("playlistId");

-- CreateIndex (unique constraint for dedup)
CREATE UNIQUE INDEX "Report_playlistId_reporterId_key" ON "Report"("playlistId", "reporterId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
