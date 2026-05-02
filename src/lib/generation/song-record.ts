import { prisma } from "@/lib/prisma";
import type { Song } from "@prisma/client";

export interface SongParams {
  title: string | null;
  prompt: string;
  tags: string | null;
  isInstrumental: boolean;
  parentSongId?: string | null;
  batchId?: string;
}

interface MockData {
  title?: string | null;
  tags?: string | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  duration?: number | null;
  lyrics?: string | null;
  model?: string | null;
}

export function createMockSongRecord(
  userId: string,
  mock: MockData,
  params: SongParams
): Promise<Song> {
  return prisma.song.create({
    data: {
      userId,
      title: mock.title || params.title || null,
      prompt: params.prompt,
      tags: mock.tags || params.tags || null,
      audioUrl: mock.audioUrl || null,
      imageUrl: mock.imageUrl || null,
      duration: mock.duration ?? null,
      lyrics: mock.lyrics || null,
      sunoModel: mock.model || null,
      isInstrumental: params.isInstrumental,
      generationStatus: "ready",
      parentSongId: params.parentSongId ?? null,
      batchId: params.batchId,
    },
  });
}

export function createPendingSongRecord(
  userId: string,
  sunoJobId: string,
  params: SongParams
): Promise<Song> {
  return prisma.song.create({
    data: {
      userId,
      sunoJobId,
      title: params.title || null,
      prompt: params.prompt,
      tags: params.tags || null,
      isInstrumental: params.isInstrumental,
      generationStatus: "pending",
      parentSongId: params.parentSongId ?? null,
      batchId: params.batchId,
    },
  });
}

export function createFailedSongRecord(
  userId: string,
  errorMessage: string,
  params: SongParams
): Promise<Song> {
  return prisma.song.create({
    data: {
      userId,
      title: params.title || null,
      prompt: params.prompt,
      tags: params.tags || null,
      isInstrumental: params.isInstrumental,
      generationStatus: "failed",
      errorMessage,
      parentSongId: params.parentSongId ?? null,
      batchId: params.batchId,
    },
  });
}
