import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { Song } from "@prisma/client";
import { acquireRateLimitSlot, releaseRateLimitSlot, type RateLimitStatus } from "@/lib/rate-limit";
import { rateLimited, insufficientCredits } from "@/lib/api-error";
import { checkCredits, deductCredits } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { userFriendlyError } from "./errors";

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

type SongRecordInput =
  | { status: "ready"; mock: MockData }
  | { status: "pending"; sunoJobId: string }
  | { status: "failed"; errorMessage: string };

function createSongRecord(
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

export interface GenerationSpec {
  userId: string;
  action: string;
  songParams: SongParams;
  apiCall: () => Promise<{ taskId: string }>;
  mockFallback: MockData;
  hasApiKey: boolean;
  description: string;
  skipCreditCheck?: boolean;
  skipCreditRecording?: boolean;
  skipRateLimit?: boolean;
  rethrow?: (error: unknown) => boolean;
}

export type GenerationOutcome =
  | { status: "denied"; response: Response }
  | { status: "created"; song: Song; rateLimitStatus?: RateLimitStatus }
  | { status: "failed"; song: Song; error: string; rawError: unknown; rateLimitStatus?: RateLimitStatus };

type RateLimitResult =
  | { limited: true; response: NextResponse }
  | { limited: false; status: RateLimitStatus };

async function enforceRateLimit(
  userId: string,
  action = "generate"
): Promise<RateLimitResult> {
  const { acquired, status } = await acquireRateLimitSlot(userId, action);
  if (acquired) {
    return { limited: false, status };
  }

  const retryAfterSec = Math.max(
    1,
    Math.ceil((new Date(status.resetAt).getTime() - Date.now()) / 1000)
  );

  logger.warn(
    { userId, action, limit: status.limit, resetAt: status.resetAt },
    "rate-limit: generation limit exceeded"
  );
  Sentry.addBreadcrumb({
    category: "rate-limit",
    message: "Generation rate limit exceeded",
    level: "warning",
    data: { userId, action, limit: status.limit, resetAt: status.resetAt },
  });

  return {
    limited: true,
    response: rateLimited(
      `Rate limit exceeded. You can generate up to ${status.limit} songs per hour.`,
      { resetAt: status.resetAt, rateLimit: status },
      { "Retry-After": String(retryAfterSec) }
    ),
  };
}

async function checkCreditBalance(
  userId: string,
  action: string
): Promise<{ denied: NextResponse } | { ok: true }> {
  const result = await checkCredits(userId, action);
  if (!result.ok) {
    return {
      denied: insufficientCredits(
        `Insufficient credits. You need ${result.creditCost} credits but only have ${result.creditsRemaining} remaining.`
      ),
    };
  }
  return { ok: true };
}

export async function executeGeneration(spec: GenerationSpec): Promise<GenerationOutcome> {
  let rateLimitStatus: RateLimitStatus | undefined;

  if (!spec.skipRateLimit) {
    const result = await enforceRateLimit(spec.userId, spec.action);
    if (result.limited) return { status: "denied", response: result.response };
    rateLimitStatus = result.status;
  }

  if (!spec.skipCreditCheck) {
    const result = await checkCreditBalance(spec.userId, spec.action);
    if ("denied" in result) return { status: "denied", response: result.denied };
  }

  if (!spec.hasApiKey) {
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "ready",
      mock: spec.mockFallback,
    });
    if (!spec.skipCreditRecording) {
      await deductCredits(spec.userId, spec.action, {
        songId: song.id,
        description: spec.description,
      });
    }
    return { status: "created", song, rateLimitStatus };
  }

  try {
    const result = await spec.apiCall();
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "pending",
      sunoJobId: result.taskId,
    });

    if (!spec.skipCreditRecording) {
      await deductCredits(spec.userId, spec.action, {
        songId: song.id,
        description: spec.description,
      });
    }

    return { status: "created", song, rateLimitStatus };
  } catch (apiError) {
    if (!spec.skipRateLimit) {
      await releaseRateLimitSlot(spec.userId).catch(() => {});
    }

    if (spec.rethrow?.(apiError)) throw apiError;

    const { message: errorMsg } = userFriendlyError(apiError);
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "failed",
      errorMessage: errorMsg,
    });

    return { status: "failed", song, error: errorMsg, rawError: apiError, rateLimitStatus };
  }
}
