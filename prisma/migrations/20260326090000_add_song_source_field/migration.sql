-- AlterTable: add source and rssFeedSubscriptionId to Song
ALTER TABLE "Song" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Song" ADD COLUMN "rssFeedSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "Song_userId_source_idx" ON "Song"("userId", "source");

-- CreateIndex
CREATE INDEX "Song_rssFeedSubscriptionId_source_createdAt_idx" ON "Song"("rssFeedSubscriptionId", "source", "createdAt");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_rssFeedSubscriptionId_fkey" FOREIGN KEY ("rssFeedSubscriptionId") REFERENCES "RssFeedSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
