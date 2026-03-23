-- CreateTable
CREATE TABLE "GenerationQueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "title" TEXT,
    "tags" TEXT,
    "makeInstrumental" BOOLEAN NOT NULL DEFAULT false,
    "personaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "position" INTEGER NOT NULL,
    "songId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationQueueItem_userId_status_idx" ON "GenerationQueueItem"("userId", "status");

-- CreateIndex
CREATE INDEX "GenerationQueueItem_userId_position_idx" ON "GenerationQueueItem"("userId", "position");

-- AddForeignKey
ALTER TABLE "GenerationQueueItem" ADD CONSTRAINT "GenerationQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationQueueItem" ADD CONSTRAINT "GenerationQueueItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
