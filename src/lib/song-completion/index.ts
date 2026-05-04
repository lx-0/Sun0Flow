import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";
import { logger } from "@/lib/logger";
import { persistSongCompletion, createAlternateSongs, markQueueItemDone, markSongFailed } from "./persist";
import { cacheCompletionAssets } from "./cache-assets";
import { notifyCompletion } from "./notify";
import { trackCompletionActivity } from "./track-activity";
import type { CompletionSong, SongRecord } from "./types";

export type { CompletionSong, SongRecord } from "./types";

export interface CompletionResult {
  persisted: boolean;
  sideEffectErrors: string[];
}

export async function handleSongSuccess(
  song: SongRecord,
  completionSongs: CompletionSong[],
): Promise<CompletionResult> {
  if (completionSongs.length === 0) return { persisted: false, sideEffectErrors: [] };

  const firstSong = completionSongs[0];

  // Critical stage: persistence must succeed or the whole operation fails.
  // Callers can safely retry on failure — no side effects have fired yet.
  const updated = await persistSongCompletion(song, firstSong);
  const alternates = await createAlternateSongs(song, completionSongs);
  await markQueueItemDone(song.id);

  // Best-effort stage: failures are logged but never propagate to callers.
  const sideEffectErrors: string[] = [];

  const runSideEffect = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      sideEffectErrors.push(name);
      logger.error({ err, songId: song.id, userId: song.userId, sideEffect: name }, "song-completion: side effect failed");
    }
  };

  await Promise.allSettled([
    runSideEffect("broadcast-alternates", () => {
      for (const alt of alternates) {
        broadcast(song.userId, {
          type: "generation_update",
          data: {
            songId: alt.id,
            parentSongId: alt.parentSongId,
            status: "ready",
            title: alt.title,
            audioUrl: alt.audioUrl,
            imageUrl: alt.imageUrl,
          },
        });
      }
    }),
    runSideEffect("broadcast-primary", () => {
      broadcast(song.userId, {
        type: "generation_update",
        data: {
          songId: song.id,
          status: "ready",
          title: updated.title,
          audioUrl: updated.audioUrl,
          imageUrl: updated.imageUrl,
          alternateCount: alternates.length,
        },
      });
    }),
    runSideEffect("broadcast-queue", () => {
      broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });
    }),
    runSideEffect("cache-assets", () => {
      cacheCompletionAssets(song, firstSong, alternates);
    }),
    runSideEffect("invalidate-dashboard", () => {
      invalidateByPrefix(`dashboard-stats:${song.userId}`);
    }),
    runSideEffect("track-activity", () => {
      trackCompletionActivity(song.userId, song.id);
    }),
    runSideEffect("notify-user", () => notifyCompletion(song.userId, updated)),
  ]);

  return { persisted: true, sideEffectErrors };
}

export async function handleSongFailure(
  song: SongRecord,
  errorMessage: string,
): Promise<void> {
  await markSongFailed(song, errorMessage);

  try {
    broadcast(song.userId, {
      type: "generation_update",
      data: { songId: song.id, status: "failed", errorMessage },
    });
    broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });
  } catch (err) {
    logger.error({ err, songId: song.id, userId: song.userId }, "song-completion: broadcast failed during failure handling");
  }
}
