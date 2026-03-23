-- CreateTable
CREATE TABLE "CreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "songId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditUsage_userId_createdAt_idx" ON "CreditUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditUsage_userId_action_idx" ON "CreditUsage"("userId", "action");

-- AddForeignKey
ALTER TABLE "CreditUsage" ADD CONSTRAINT "CreditUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
