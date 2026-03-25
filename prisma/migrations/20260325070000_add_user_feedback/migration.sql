-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "screenshotUrl" TEXT,
    "pageUrl" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFeedback_userId_idx" ON "UserFeedback"("userId");

-- CreateIndex
CREATE INDEX "UserFeedback_category_createdAt_idx" ON "UserFeedback"("category", "createdAt");

-- CreateIndex
CREATE INDEX "UserFeedback_createdAt_idx" ON "UserFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
