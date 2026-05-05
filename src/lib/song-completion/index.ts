import { recordActivity } from "@/lib/activity";
import { invalidateByPrefix } from "@/lib/cache";
import { sendGenerationCompleteEmail } from "@/lib/email";
import { broadcast } from "@/lib/event-bus";
import { audioCache, imageCache } from "@/lib/file-cache";
import { logger } from "@/lib/logger";
import { notifyFollowersOfNewSong } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { recordDailyActivity, checkSongMilestones, checkStreakMilestones } from "@/lib/streaks";
import { persistSongCompletion, createAlternateSongs, markQueueItemDone, markSongFailed } from "./persist";
import type { CompletionSong, SongRecord, PersistedSong, AlternateSong } from "./types";

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

  const updated = await persistSongCompletion(song, firstSong);
  const alternates = await createAlternateSongs(song, completionSongs);
  await markQueueItemDone(song.id);

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

function cacheCompletionAssets(
  song: SongRecord,
  firstSong: CompletionSong,
  alternates: AlternateSong[],
): void {
  if (firstSong.audioUrl && !audioCache.has(song.id)) {
    audioCache.downloadAndPut(song.id, firstSong.audioUrl).catch(() => {});
  }
  const coverUrl = firstSong.imageUrl || song.imageUrl;
  if (coverUrl && !imageCache.has(song.id)) {
    imageCache.downloadAndPut(song.id, coverUrl).catch(() => {});
  }

  for (const alt of alternates) {
    if (alt.audioSource.audioUrl) {
      audioCache.downloadAndPut(alt.id, alt.audioSource.audioUrl).catch(() => {});
    }
    if (alt.audioSource.imageUrl) {
      imageCache.downloadAndPut(alt.id, alt.audioSource.imageUrl).catch(() => {});
    }
  }
}

function trackCompletionActivity(userId: string, songId: string): void {
  recordActivity({ userId, type: "song_created", songId });
  notifyFollowersOfNewSong(userId, songId).catch(() => {});

  recordDailyActivity(userId)
    .then((newStreak) => checkStreakMilestones(userId, newStreak))
    .catch(() => {});
  checkSongMilestones(userId).catch(() => {});
}

async function notifyCompletion(userId: string, song: PersistedSong): Promise<void> {
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailGenerationComplete: true,
      unsubscribeToken: true,
      pushGenerationComplete: true,
    },
  });

  if (userPrefs?.email && userPrefs.emailGenerationComplete) {
    let unsubToken = userPrefs.unsubscribeToken;
    if (!unsubToken) {
      unsubToken = crypto.randomUUID();
      await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: unsubToken } });
    }
    sendGenerationCompleteEmail(userPrefs.email, { id: song.id, title: song.title }, unsubToken).catch((err) =>
      logger.error({ userId, songId: song.id, err }, "song-completion: failed to send generation complete email")
    );
  }

  if (userPrefs?.pushGenerationComplete !== false) {
    sendPushToUser(userId, {
      title: "Your song is ready!",
      body: `"${song.title || "Untitled"}" has finished generating`,
      url: `/library`,
      tag: `generation-complete-${song.id}`,
    }).catch(() => {});
  }
}
