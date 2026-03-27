-- CreateTable
CREATE TABLE "AnonRateLimitEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonRateLimitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnonRateLimitEntry_key_action_createdAt_idx" ON "AnonRateLimitEntry"("key", "action", "createdAt");
