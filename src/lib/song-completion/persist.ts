import { prisma } from "@/lib/prisma";
import type { CompletionSong, SongRecord, PersistedSong, AlternateSong } from "./types";

const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export async function persistSongCompletion(
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

export async function createAlternateSongs(
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

export async function markQueueItemDone(songId: string): Promise<void> {
  await prisma.generationQueueItem.updateMany({
    where: { songId, status: "processing" },
    data: { status: "done" },
  });
}

export async function markSongFailed(
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
