import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";
import { sendGenerationCompleteEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { recordActivity } from "@/lib/activity";
import { recordDailyActivity, checkSongMilestones, checkStreakMilestones } from "@/lib/streaks";
import { sendPushToUser } from "@/lib/push";
import { downloadAndCache, isCached } from "@/lib/audio-cache";
import crypto from "crypto";


interface CompletionSong {
  audioUrl?: string;
  imageUrl?: string;
  duration?: number;
  lyrics?: string;
  title?: string;
  tags?: string;
  model?: string;
  id?: string;
}

interface SongRecord {
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

export async function handleSongSuccess(
  song: SongRecord,
  completionSongs: CompletionSong[],
): Promise<void> {
  if (completionSongs.length === 0) return;

  const firstSong = completionSongs[0];
  const cdnUrlExpiresAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: {
      generationStatus: "ready",
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

  if (firstSong.audioUrl && !isCached(song.id)) {
    downloadAndCache(song.id, firstSong.audioUrl).catch(() => {});
  }

  for (let i = 1; i < completionSongs.length; i++) {
    const extra = completionSongs[i];
    const alternateSong = await prisma.song.create({
      data: {
        userId: song.userId,
        sunoJobId: extra.id || null,
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
    broadcast(song.userId, {
      type: "generation_update",
      data: {
        songId: alternateSong.id,
        parentSongId: song.id,
        status: "ready",
        title: alternateSong.title,
        audioUrl: alternateSong.audioUrl,
        imageUrl: alternateSong.imageUrl,
      },
    });
    if (extra.audioUrl) {
      downloadAndCache(alternateSong.id, extra.audioUrl).catch(() => {});
    }
  }

  const alternateCount = completionSongs.length - 1;
  invalidateByPrefix(`dashboard-stats:${song.userId}`);
  broadcast(song.userId, {
    type: "generation_update",
    data: {
      songId: song.id,
      status: "ready",
      title: updated.title,
      audioUrl: updated.audioUrl,
      imageUrl: updated.imageUrl,
      alternateCount,
    },
  });

  recordActivity({ userId: song.userId, type: "song_created", songId: song.id });

  recordDailyActivity(song.userId)
    .then((newStreak) => checkStreakMilestones(song.userId, newStreak))
    .catch(() => {});
  checkSongMilestones(song.userId).catch(() => {});

  await prisma.generationQueueItem.updateMany({
    where: { songId: song.id, status: "processing" },
    data: { status: "done" },
  });
  broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });

  const userPrefs = await prisma.user.findUnique({
    where: { id: song.userId },
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
      await prisma.user.update({ where: { id: song.userId }, data: { unsubscribeToken: unsubToken } });
    }
    sendGenerationCompleteEmail(userPrefs.email, { id: song.id, title: updated.title }, unsubToken).catch((err) =>
      logger.error({ userId: song.userId, songId: song.id, err }, "song-completion: failed to send generation complete email")
    );
  }
  if (userPrefs?.pushGenerationComplete !== false) {
    sendPushToUser(song.userId, {
      title: "Your song is ready!",
      body: `"${updated.title || "Untitled"}" has finished generating`,
      url: `/library`,
      tag: `generation-complete-${song.id}`,
    }).catch(() => {});
  }
}

export async function handleSongFailure(
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
  broadcast(song.userId, {
    type: "generation_update",
    data: { songId: song.id, status: "failed", errorMessage },
  });
  await prisma.generationQueueItem.updateMany({
    where: { songId: song.id, status: "processing" },
    data: { status: "failed", errorMessage },
  });
  broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });
}
