-- AlterTable
ALTER TABLE "RssFeedSubscription" ADD COLUMN "autoGenerate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RssFeedSubscription" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PendingFeedGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedSubscriptionId" TEXT,
    "feedTitle" TEXT,
    "itemTitle" TEXT NOT NULL,
    "itemLink" TEXT,
    "itemPubDate" TEXT,
    "prompt" TEXT NOT NULL,
    "style" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingFeedGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RssFeedSubscription_autoGenerate_idx" ON "RssFeedSubscription"("autoGenerate");

-- CreateIndex
CREATE INDEX "PendingFeedGeneration_userId_status_idx" ON "PendingFeedGeneration"("userId", "status");

-- CreateIndex
CREATE INDEX "PendingFeedGeneration_userId_createdAt_idx" ON "PendingFeedGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingFeedGeneration_feedSubscriptionId_idx" ON "PendingFeedGeneration"("feedSubscriptionId");

-- AddForeignKey
ALTER TABLE "PendingFeedGeneration" ADD CONSTRAINT "PendingFeedGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingFeedGeneration" ADD CONSTRAINT "PendingFeedGeneration_feedSubscriptionId_fkey" FOREIGN KEY ("feedSubscriptionId") REFERENCES "RssFeedSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
