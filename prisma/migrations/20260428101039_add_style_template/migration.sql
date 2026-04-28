-- CreateTable
CREATE TABLE "StyleTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "sourceSongId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StyleTemplate_userId_createdAt_idx" ON "StyleTemplate"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StyleTemplate_sourceSongId_idx" ON "StyleTemplate"("sourceSongId");

-- AddForeignKey
ALTER TABLE "StyleTemplate" ADD CONSTRAINT "StyleTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleTemplate" ADD CONSTRAINT "StyleTemplate_sourceSongId_fkey" FOREIGN KEY ("sourceSongId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
