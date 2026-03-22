-- CreateTable
CREATE TABLE "RssFeedSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RssFeedSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RssFeedSubscription_userId_idx" ON "RssFeedSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RssFeedSubscription_userId_url_key" ON "RssFeedSubscription"("userId", "url");

-- AddForeignKey
ALTER TABLE "RssFeedSubscription" ADD CONSTRAINT "RssFeedSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
