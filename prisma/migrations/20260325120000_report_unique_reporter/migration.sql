-- AddUniqueConstraint
-- Prevents the same user from filing duplicate reports on the same song.
-- Duplicate rows (if any) are de-duplicated by keeping the oldest report per pair.

DELETE FROM "Report" r1
USING "Report" r2
WHERE r1."songId" = r2."songId"
  AND r1."reporterId" = r2."reporterId"
  AND r1."createdAt" > r2."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "Report_songId_reporterId_key"
  ON "Report"("songId", "reporterId");
