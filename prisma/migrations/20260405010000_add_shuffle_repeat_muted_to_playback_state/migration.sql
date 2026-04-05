-- AlterTable
ALTER TABLE "PlaybackState" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeat" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "shuffle" BOOLEAN NOT NULL DEFAULT false;
