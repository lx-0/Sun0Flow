-- Add missing indexes for common query patterns

-- Song(userId, isFavorite): used in dashboard/stats totalFavorites count
CREATE INDEX IF NOT EXISTS "Song_userId_isFavorite_idx" ON "Song"("userId", "isFavorite");

-- Song(userId, downloadCount): used in analytics top songs sorted by downloadCount
CREATE INDEX IF NOT EXISTS "Song_userId_downloadCount_idx" ON "Song"("userId", "downloadCount");

-- PlayHistory(userId, songId, playedAt): used in POST /api/history dedup check
-- findFirst({ where: { userId, songId, playedAt: { gte: cutoff } } })
CREATE INDEX IF NOT EXISTS "PlayHistory_userId_songId_playedAt_idx" ON "PlayHistory"("userId", "songId", "playedAt" DESC);
