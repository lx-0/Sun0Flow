-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "theme" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionSong" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionSong_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_isPublic_createdAt_idx" ON "Collection"("isPublic", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionSong_collectionId_songId_key" ON "CollectionSong"("collectionId", "songId");

-- CreateIndex
CREATE INDEX "CollectionSong_collectionId_position_idx" ON "CollectionSong"("collectionId", "position");

-- CreateIndex
CREATE INDEX "CollectionSong_songId_idx" ON "CollectionSong"("songId");

-- AddForeignKey
ALTER TABLE "CollectionSong" ADD CONSTRAINT "CollectionSong_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSong" ADD CONSTRAINT "CollectionSong_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
