-- Migration: add_notification_digest_frequency
-- Replaces emailWeeklyHighlights (boolean) with emailDigestFrequency (string enum)
-- and adds quiet hours preferences.

-- Add new digest frequency field (default "off")
ALTER TABLE "User" ADD COLUMN "emailDigestFrequency" TEXT NOT NULL DEFAULT 'off';

-- Migrate existing data: true → "weekly", false → "off" (backward compatible)
UPDATE "User" SET "emailDigestFrequency" = 'weekly' WHERE "emailWeeklyHighlights" = true;

-- Drop the old boolean field
ALTER TABLE "User" DROP COLUMN "emailWeeklyHighlights";

-- Add quiet hours fields
ALTER TABLE "User" ADD COLUMN "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "quietHoursStart" INTEGER NOT NULL DEFAULT 22;
ALTER TABLE "User" ADD COLUMN "quietHoursEnd" INTEGER NOT NULL DEFAULT 8;
