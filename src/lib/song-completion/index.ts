import { recordActivity } from "@/lib/activity";
import { invalidateByPrefix, audioCache, imageCache } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";
import { logger } from "@/lib/logger";
import { notifyFollowersOfNewSong, notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { recordDailyActivity, checkSongMilestones, checkStreakMilestones } from "@/lib/streaks";

// ── Types ───────────────────────────────────────────────────────────

export interface CompletionSong {
  audioUrl?: string;
  imageUrl?: string;
  duration?: number;
  lyrics?: string;
  title?: string;
  tags?: string;
  model?: string;
  id?: string;
}

export interface SongRecord {
  id: string;
  userId: string;
  prompt: string | null;
  tags: string | null;
  audioUrl: string | null;
  audioUrlExpiresAt: Date | null;
  imageUrl: string | null;
  imageUrlExpiresAt: Date | null;
  duration: number | null;
  lyrics: string | null;
  title: string | null;
  sunoModel: string | null;
  isInstrumental: boolean;
  pollCount: number;
}

interface PersistedSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
}

interface AlternateSong {
  id: string;
  parentSongId: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  audioSource: CompletionSong;
}

// ── Public interface ────────────────────────────────────────────────

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
    runSideEffect("notify-user", async () => {
      await notifyUser({
        userId: song.userId,
        type: "generation_complete",
        title: "Your song is ready!",
        message: `"${updated.title || "Untitled"}" has finished generating`,
        href: "/library",
        songId: song.id,
        push: { tag: `generation-complete-${song.id}` },
      });
    }),
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

// ── Persistence ─────────────────────────────────────────────────────

const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

async function persistSongCompletion(
  song: SongRecord,
  firstSong: CompletionSong,
): Promise<PersistedSong> {
  const cdnUrlExpiresAt = new Date(Date.now() + CDN_URL_TTL_MS);

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: {
      generationStatus: "ready",
      sunoAudioId: firstSong.id || undefined,
      audioUrl: firstSong.audioUrl || song.audioUrl,
      audioUrlExpiresAt: firstSong.audioUrl ? cdnUrlExpiresAt : song.audioUrlExpiresAt,
      imageUrl: firstSong.imageUrl || song.imageUrl,
      imageUrlExpiresAt: firstSong.imageUrl ? cdnUrlExpiresAt : song.imageUrlExpiresAt,
      duration: firstSong.duration ?? song.duration,
      lyrics: firstSong.lyrics || song.lyrics,
      title: firstSong.title || song.title,
      tags: firstSong.tags || song.tags,
      sunoModel: firstSong.model || song.sunoModel,
      pollCount: song.pollCount + 1,
    },
  });

  return { id: updated.id, title: updated.title, audioUrl: updated.audioUrl, imageUrl: updated.imageUrl };
}

async function createAlternateSongs(
  song: SongRecord,
  completionSongs: CompletionSong[],
): Promise<AlternateSong[]> {
  if (completionSongs.length <= 1) return [];

  const cdnUrlExpiresAt = new Date(Date.now() + CDN_URL_TTL_MS);
  const alternates: AlternateSong[] = [];

  for (let i = 1; i < completionSongs.length; i++) {
    const extra = completionSongs[i];
    const created = await prisma.song.create({
      data: {
        userId: song.userId,
        sunoJobId: extra.id || null,
        sunoAudioId: extra.id || null,
        title: extra.title || song.title,
        prompt: song.prompt,
        tags: extra.tags || song.tags,
        audioUrl: extra.audioUrl || null,
        audioUrlExpiresAt: extra.audioUrl ? cdnUrlExpiresAt : null,
        imageUrl: extra.imageUrl || null,
        imageUrlExpiresAt: extra.imageUrl ? cdnUrlExpiresAt : null,
        duration: extra.duration ?? null,
        lyrics: extra.lyrics || null,
        sunoModel: extra.model || null,
        isInstrumental: song.isInstrumental,
        generationStatus: "ready",
        parentSongId: song.id,
      },
    });
    alternates.push({
      id: created.id,
      parentSongId: song.id,
      title: created.title,
      audioUrl: created.audioUrl,
      imageUrl: created.imageUrl,
      audioSource: extra,
    });
  }

  return alternates;
}

async function markQueueItemDone(songId: string): Promise<void> {
  await prisma.generationQueueItem.updateMany({
    where: { songId, status: "processing" },
    data: { status: "done" },
  });
}

async function markSongFailed(
  song: SongRecord,
  errorMessage: string,
): Promise<void> {
  await prisma.song.update({
    where: { id: song.id },
    data: {
      generationStatus: "failed",
      pollCount: song.pollCount + 1,
      errorMessage,
    },
  });
  await prisma.generationQueueItem.updateMany({
    where: { songId: song.id, status: "processing" },
    data: { status: "failed", errorMessage },
  });
}

// ── Side-effect helpers ─────────────────────────────────────────────

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
