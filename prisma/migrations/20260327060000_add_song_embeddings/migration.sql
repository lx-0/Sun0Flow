-- CreateTable
CREATE TABLE "SongEmbedding" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SongEmbedding_songId_key" ON "SongEmbedding"("songId");

-- CreateIndex
CREATE INDEX "SongEmbedding_songId_idx" ON "SongEmbedding"("songId");

-- CreateIndex
CREATE INDEX "SongEmbedding_updatedAt_idx" ON "SongEmbedding"("updatedAt");

-- AddForeignKey
ALTER TABLE "SongEmbedding" ADD CONSTRAINT "SongEmbedding_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
