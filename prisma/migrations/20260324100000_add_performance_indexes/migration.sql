-- Add missing performance indexes for frequently queried columns

-- Song: generationStatus is frequently filtered (library, discover, recommendations)
CREATE INDEX IF NOT EXISTS "Song_generationStatus_idx" ON "Song"("generationStatus");

-- Song: compound index for discover page (public, not hidden, ready songs)
CREATE INDEX IF NOT EXISTS "Song_isPublic_generationStatus_isHidden_idx" ON "Song"("isPublic", "generationStatus", "isHidden");

-- Song: userId + generationStatus for user library status filter
CREATE INDEX IF NOT EXISTS "Song_userId_generationStatus_idx" ON "Song"("userId", "generationStatus");

-- Song: userId + rating for rating filter/sort in library
CREATE INDEX IF NOT EXISTS "Song_userId_rating_idx" ON "Song"("userId", "rating");

-- Song: userId + updatedAt for "recently modified" sort
CREATE INDEX IF NOT EXISTS "Song_userId_updatedAt_idx" ON "Song"("userId", "updatedAt");

-- Song: isPublic + createdAt for public discover sorting
CREATE INDEX IF NOT EXISTS "Song_isPublic_createdAt_idx" ON "Song"("isPublic", "createdAt");

-- Song: isPublic + playCount for discover most-played sort
CREATE INDEX IF NOT EXISTS "Song_isPublic_playCount_idx" ON "Song"("isPublic", "playCount");

-- Song: isPublic + rating for discover highest-rated sort
CREATE INDEX IF NOT EXISTS "Song_isPublic_rating_idx" ON "Song"("isPublic", "rating");

-- Notification: userId + createdAt (already partially covered but add explicit)
-- Already covered by @@index([userId, read, createdAt]) in schema
-- GenerationQueueItem: status filter for queue processing
CREATE INDEX IF NOT EXISTS "GenerationQueueItem_status_idx" ON "GenerationQueueItem"("status");
