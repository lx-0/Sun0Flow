/**
 * Recover songs that have been stuck in `generationStatus="pending"` past
 * the polling-grace window.
 *
 * Background: when both the server-side SSE poll loop and the client-side
 * polling driver die before completion (server restart, tab close), the
 * song stays `pending` in DB even though Suno may have completed it
 * upstream. This module probes Suno one more time per stale row and:
 *
 *   - `ready`        → handleSongSuccess (song recovers, library reappears)
 *   - `failed`       → handleSongFailure with the real upstream reason
 *   - `processing`   → bump pollCount, defer; hard-fail past the ceiling
 *   - `poll_error`   → handleSongFailure with "upstream lost"
 *
 * Per-row failures are isolated — one bad row must not abort the loop.
 *
 * This module is intentionally separate from `library.ts` (the read
 * path). The recovery sweep used to be hidden inside `querySongLibrary`
 * as a fire-and-forget call; that mixed a read with a write and made
 * the read function hard to test. The trigger is now explicit at the
 * route layer.
 */
import { handleSongFailure, handleSongSuccess, pollOnce } from "@/lib/generation";
import type { SongRecord } from "@/lib/generation";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";

const STALE_PENDING_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_PENDING_HARD_CEILING_MS = 60 * 60 * 1000;

export async function runStalePendingRecovery(userId: string): Promise<void> {
  const now = Date.now();
  const staleThreshold = new Date(now - STALE_PENDING_THRESHOLD_MS);

  const stale = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "pending",
      updatedAt: { lt: staleThreshold },
    },
    select: {
      id: true,
      userId: true,
      sunoJobId: true,
      pollCount: true,
      createdAt: true,
      prompt: true,
      tags: true,
      audioUrl: true,
      audioUrlExpiresAt: true,
      imageUrl: true,
      imageUrlExpiresAt: true,
      duration: true,
      lyrics: true,
      title: true,
      sunoModel: true,
      isInstrumental: true,
    },
  });
  if (stale.length === 0) return;

  const apiKey = await resolveUserApiKey(userId);

  for (const song of stale) {
    try {
      const record: SongRecord = {
        id: song.id,
        userId: song.userId,
        prompt: song.prompt,
        tags: song.tags,
        audioUrl: song.audioUrl,
        audioUrlExpiresAt: song.audioUrlExpiresAt,
        imageUrl: song.imageUrl,
        imageUrlExpiresAt: song.imageUrlExpiresAt,
        duration: song.duration,
        lyrics: song.lyrics,
        title: song.title,
        sunoModel: song.sunoModel,
        isInstrumental: song.isInstrumental,
        pollCount: song.pollCount,
      };
      const ageMs = now - song.createdAt.getTime();

      if (!song.sunoJobId) {
        await handleSongFailure(record, "Generation timed out (no Suno task ID)");
        continue;
      }

      const outcome = await pollOnce(song.sunoJobId, apiKey);

      switch (outcome.kind) {
        case "ready":
          await handleSongSuccess(record, outcome.songs);
          break;
        case "failed":
          await handleSongFailure(record, outcome.errorMessage);
          break;
        case "processing":
          if (ageMs >= STALE_PENDING_HARD_CEILING_MS) {
            await handleSongFailure(record, "Generation timed out (upstream still processing)");
          } else {
            await prisma.song.update({
              where: { id: song.id },
              data: { pollCount: song.pollCount + 1 },
            });
            logger.warn(
              { songId: song.id, sunoJobId: song.sunoJobId, pollCount: song.pollCount, ageMs },
              "stale-pending: upstream still processing, deferring",
            );
          }
          break;
        case "poll_error":
          logServerError("song-stale-poll-error", outcome.error, {
            userId,
            route: "/api/songs",
            params: { songId: song.id, sunoJobId: song.sunoJobId, pollCount: song.pollCount, ageMs },
          });
          await handleSongFailure(record, "Generation timed out (upstream lost)");
          break;
      }
    } catch (err) {
      logServerError("song-stale-recover-error", err, {
        userId,
        route: "/api/songs",
        params: { songId: song.id, sunoJobId: song.sunoJobId },
      });
    }
  }
}

/**
 * Fire-and-forget wrapper for callers (API routes, cron) who don't want
 * to await the sweep. Logs uncaught errors to GlitchTip rather than
 * letting them become unhandled rejections.
 */
export function kickoffStalePendingRecovery(userId: string): void {
  runStalePendingRecovery(userId).catch((err) => {
    logServerError("songs-stale-cleanup", err, { userId, route: "/api/songs" });
  });
}
