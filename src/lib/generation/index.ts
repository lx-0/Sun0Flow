import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { Song } from "@prisma/client";
import { acquireRateLimitSlot, releaseRateLimitSlot, type RateLimitStatus } from "@/lib/rate-limit";
import { rateLimited, insufficientCredits } from "@/lib/api-error";
import { checkCredits, deductCredits } from "@/lib/credits";
import { SunoApiError } from "@/lib/sunoapi";
import { ErrorCode } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { CircuitOpenError, onCircuitClose } from "@/lib/circuit-breaker";
import { recordGenerationStart, recordGenerationEnd } from "@/lib/metrics";
import { invalidateByPrefix } from "@/lib/cache";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { drainGenerationQueue } from "@/lib/queue-processor";

onCircuitClose(() => {
  drainGenerationQueue().catch((err) => {
    logger.error({ err }, "generation: queue drain failed after circuit close");
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface GenerationError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export function userFriendlyError(error: unknown, fallbackMessage?: string): GenerationError {
  if (error instanceof SunoApiError) {
    if (error.status === 402)
      return { message: "Insufficient credits. Please check your balance or top up to continue.", code: ErrorCode.INSUFFICIENT_CREDITS };
    if (error.status === 409)
      return { message: "A conflicting request is already in progress. Please wait and try again.", code: ErrorCode.CONFLICT };
    if (error.status === 422)
      return { message: `Validation error: ${error.message}`, code: ErrorCode.VALIDATION_ERROR, details: error.details };
    if (error.status === 429)
      return { message: "The music generation service is busy. Please try again in a few minutes.", code: ErrorCode.SUNO_RATE_LIMIT };
    if (error.status === 451)
      return { message: "This request was blocked for compliance reasons. Please modify your prompt and try again.", code: ErrorCode.COMPLIANCE_BLOCK };
    if (error.status === 400)
      return { message: "Invalid parameters. Please adjust your settings and try again.", code: ErrorCode.VALIDATION_ERROR };
    if (error.status === 401 || error.status === 403)
      return { message: "API authentication failed. Please check your API key in settings.", code: ErrorCode.SUNO_AUTH_ERROR };
    if (error.status >= 500)
      return { message: "The music generation service is temporarily unavailable. Please try again later.", code: ErrorCode.SERVICE_UNAVAILABLE };
    return { message: `Operation failed: ${error.message}`, code: ErrorCode.SUNO_API_ERROR };
  }
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return { message: "Could not reach the music generation service. Please check your connection and try again.", code: ErrorCode.SERVICE_UNAVAILABLE };
  }
  return { message: fallbackMessage ?? "Operation failed. Please try again.", code: ErrorCode.INTERNAL_ERROR };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

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

export type GuardPolicy =
  | "standard"
  | "free"
  | "admin"
  | "personal-key"
  | "pre-authorized";

function resolveGuards(policy: GuardPolicy) {
  switch (policy) {
    case "standard":       return { rateLimit: true,  creditCheck: true,  creditRecording: true };
    case "free":           return { rateLimit: true,  creditCheck: false, creditRecording: false };
    case "admin":          return { rateLimit: false, creditCheck: true,  creditRecording: true };
    case "personal-key":   return { rateLimit: false, creditCheck: false, creditRecording: false };
    case "pre-authorized": return { rateLimit: false, creditCheck: false, creditRecording: true };
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
  guards?: GuardPolicy;
  coverArt?: boolean;
}

export type GenerationOutcome =
  | { status: "denied"; response: Response }
  | { status: "created"; song: Song; rateLimitStatus?: RateLimitStatus }
  | { status: "queued"; message: string }
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
  const guards = resolveGuards(spec.guards ?? "standard");
  let rateLimitStatus: RateLimitStatus | undefined;

  if (guards.rateLimit) {
    const result = await enforceRateLimit(spec.userId, spec.action);
    if (result.limited) return { status: "denied", response: result.response };
    rateLimitStatus = result.status;
  }

  if (guards.creditCheck) {
    const result = await checkCreditBalance(spec.userId, spec.action);
    if ("denied" in result) return { status: "denied", response: result.denied };
  }

  if (!spec.hasApiKey) {
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "ready",
      mock: spec.mockFallback,
    });
    if (guards.creditRecording) {
      await deductCredits(spec.userId, spec.action, {
        songId: song.id,
        description: spec.description,
      });
    }
    afterCreation(spec, song);
    return { status: "created", song, rateLimitStatus };
  }

  recordGenerationStart();
  const startMs = Date.now();

  try {
    const result = await spec.apiCall();
    recordGenerationEnd(Date.now() - startMs, true);

    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "pending",
      sunoJobId: result.taskId,
    });

    if (guards.creditRecording) {
      await deductCredits(spec.userId, spec.action, {
        songId: song.id,
        description: spec.description,
      });
    }

    afterCreation(spec, song);
    return { status: "created", song, rateLimitStatus };
  } catch (apiError) {
    if (apiError instanceof CircuitOpenError) {
      recordGenerationEnd(0, false);
      return enqueueGeneration(spec);
    }

    recordGenerationEnd(Date.now() - startMs, false);

    if (guards.rateLimit) {
      await releaseRateLimitSlot(spec.userId).catch(() => {});
    }

    const { message: errorMsg } = userFriendlyError(apiError);
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "failed",
      errorMessage: errorMsg,
    });

    return { status: "failed", song, error: errorMsg, rawError: apiError, rateLimitStatus };
  }
}

function afterCreation(spec: GenerationSpec, song: Song): void {
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

async function enqueueGeneration(spec: GenerationSpec): Promise<GenerationOutcome> {
  logger.warn({ userId: spec.userId }, "generation: circuit open — queuing request");

  const maxPos = await prisma.generationQueueItem.aggregate({
    _max: { position: true },
    where: { userId: spec.userId, status: "pending" },
  });
  const position = (maxPos._max.position ?? 0) + 1;

  await prisma.generationQueueItem.create({
    data: {
      userId: spec.userId,
      prompt: spec.songParams.prompt,
      title: spec.songParams.title ?? null,
      tags: spec.songParams.tags ?? null,
      makeInstrumental: spec.songParams.isInstrumental,
      personaId: spec.songParams.personaId ?? null,
      status: "pending",
      position,
    },
  });

  return {
    status: "queued",
    message: "Music generation is temporarily unavailable. Your request has been queued and will be processed automatically when the service recovers.",
  };
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export interface TransformSpec {
  userId: string;
  action: string;
  apiCall: () => Promise<{ taskId: string }>;
  hasApiKey: boolean;
  mockTaskId: string;
  fallbackErrorMessage?: string;
  guards?: GuardPolicy;
}

export type TransformOutcome =
  | { status: "denied"; response: Response }
  | { status: "completed"; taskId: string; mockMode: boolean; rateLimitStatus?: RateLimitStatus }
  | { status: "failed"; error: string; rawError: unknown; rateLimitStatus?: RateLimitStatus };

export async function executeTransform(spec: TransformSpec): Promise<TransformOutcome> {
  const guards = resolveGuards(spec.guards ?? "free");
  let rateLimitStatus: RateLimitStatus | undefined;

  if (guards.rateLimit) {
    const result = await enforceRateLimit(spec.userId, spec.action);
    if (result.limited) return { status: "denied", response: result.response };
    rateLimitStatus = result.status;
  }

  if (guards.creditCheck) {
    const result = await checkCreditBalance(spec.userId, spec.action);
    if ("denied" in result) return { status: "denied", response: result.denied };
  }

  if (!spec.hasApiKey) {
    return { status: "completed", taskId: spec.mockTaskId, mockMode: true, rateLimitStatus };
  }

  try {
    const result = await spec.apiCall();
    return { status: "completed", taskId: result.taskId, mockMode: false, rateLimitStatus };
  } catch (apiError) {
    if (guards.rateLimit) {
      await releaseRateLimitSlot(spec.userId).catch(() => {});
    }
    const { message: errorMsg } = userFriendlyError(apiError, spec.fallbackErrorMessage);
    return { status: "failed", error: errorMsg, rawError: apiError, rateLimitStatus };
  }
}
