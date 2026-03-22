-- AlterTable
ALTER TABLE "Song" ADD COLUMN "parentSongId" TEXT;

-- CreateIndex
CREATE INDEX "Song_parentSongId_idx" ON "Song"("parentSongId");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_parentSongId_fkey" FOREIGN KEY ("parentSongId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
