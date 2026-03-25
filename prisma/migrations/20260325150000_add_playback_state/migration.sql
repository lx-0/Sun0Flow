-- CreateTable
CREATE TABLE "PlaybackState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queue" JSONB NOT NULL DEFAULT '[]',
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackState_userId_key" ON "PlaybackState"("userId");

-- CreateIndex
CREATE INDEX "PlaybackState_userId_idx" ON "PlaybackState"("userId");

-- AddForeignKey
ALTER TABLE "PlaybackState" ADD CONSTRAINT "PlaybackState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackState" ADD CONSTRAINT "PlaybackState_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
