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

export interface MockData {
  title?: string | null;
  tags?: string | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  duration?: number | null;
  lyrics?: string | null;
  model?: string | null;
}

export type SongRecordInput =
  | { status: "ready"; mock: MockData }
  | { status: "pending"; sunoJobId: string }
  | { status: "failed"; errorMessage: string };

export function createSongRecord(
  userId: string,
  params: SongParams,
  input: SongRecordInput
): Promise<Song> {
  const base = {
    userId,
    title: params.title || null,
    prompt: params.prompt,
    tags: params.tags || null,
    isInstrumental: params.isInstrumental,
    parentSongId: params.parentSongId ?? null,
    batchId: params.batchId,
  };

  switch (input.status) {
    case "ready":
      return prisma.song.create({
        data: {
          ...base,
          title: input.mock.title || base.title,
          tags: input.mock.tags || base.tags,
          audioUrl: input.mock.audioUrl || null,
          imageUrl: input.mock.imageUrl || null,
          duration: input.mock.duration ?? null,
          lyrics: input.mock.lyrics || null,
          sunoModel: input.mock.model || null,
          generationStatus: "ready",
        },
      });
    case "pending":
      return prisma.song.create({
        data: {
          ...base,
          sunoJobId: input.sunoJobId,
          generationStatus: "pending",
        },
      });
    case "failed":
      return prisma.song.create({
        data: {
          ...base,
          errorMessage: input.errorMessage,
          generationStatus: "failed",
        },
      });
  }
}
