-- DropIndex
DROP INDEX "Song_tags_trgm_idx";

-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "sunoAudioId" TEXT;
