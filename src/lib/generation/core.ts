import type { Song } from "@prisma/client";
import { deductCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { CircuitOpenError } from "@/lib/circuit-breaker";
import { recordGenerationStart, recordGenerationEnd } from "@/lib/metrics";
import { invalidateByPrefix } from "@/lib/cache";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { userFriendlyError } from "./errors";

export interface SongParams {
  title: string | null;
  prompt: string;
  tags: string | null;
  isInstrumental: boolean;
  parentSongId?: string | null;
  batchId?: string;
  personaId?: string | null;
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

type SongRecordInput =
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

export function afterCreation(
  spec: { userId: string; songParams: SongParams; coverArt?: boolean },
  song: Song
): void {
  invalidateByPrefix(`dashboard-stats:${spec.userId}`);

  if (spec.coverArt) {
    try {
      const [variant] = generateCoverArtVariants({
        songId: song.id,
        title: spec.songParams.title,
        tags: spec.songParams.tags,
      });
      prisma.song.update({
        where: { id: song.id },
        data: { imageUrl: variant.dataUrl },
      }).catch(() => {});
    } catch {
      // Non-critical
    }
  }
}

export interface CoreSpec {
  userId: string;
  action: string;
  songParams: SongParams;
  apiCall: () => Promise<{ taskId: string }>;
  description: string;
  creditRecording: boolean;
  coverArt?: boolean;
}

export type CoreOutcome =
  | { status: "created"; song: Song }
  | { status: "api_error"; rawError: unknown; song: Song; errorMessage: string }
  | { status: "circuit_open" };

export async function executeCore(core: CoreSpec): Promise<CoreOutcome> {
  recordGenerationStart();
  const startMs = Date.now();

  try {
    const result = await core.apiCall();
    recordGenerationEnd(Date.now() - startMs, true);

    const song = await createSongRecord(core.userId, core.songParams, {
      status: "pending",
      sunoJobId: result.taskId,
    });

    if (core.creditRecording) {
      await deductCredits(core.userId, core.action, {
        songId: song.id,
        description: core.description,
      });
    }

    afterCreation(
      { userId: core.userId, songParams: core.songParams, coverArt: core.coverArt },
      song
    );
    return { status: "created", song };
  } catch (apiError) {
    if (apiError instanceof CircuitOpenError) {
      recordGenerationEnd(0, false);
      return { status: "circuit_open" };
    }

    recordGenerationEnd(Date.now() - startMs, false);
    const { message: errorMsg } = userFriendlyError(apiError);
    const song = await createSongRecord(core.userId, core.songParams, {
      status: "failed",
      errorMessage: errorMsg,
    });
    return { status: "api_error", rawError: apiError, song, errorMessage: errorMsg };
  }
}
