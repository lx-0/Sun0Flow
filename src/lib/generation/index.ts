import type { Song } from "@prisma/client";
import type { RateLimitStatus } from "@/lib/rate-limit";
import { releaseRateLimitSlot } from "@/lib/rate-limit";
import { deductCredits } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { applyGuards, type GuardPolicy } from "./guards";
import { createSongRecord, afterCreation, executeCore, type SongParams, type MockData } from "./core";

// Re-exports: keep the public interface stable for all callers.
export { pollToCompletion } from "./completion";
export type { CompletionUpdate, CompletionTarget } from "./completion";
export { respondToGeneration, respondToTransform } from "./respond";
export { userFriendlyError } from "./errors";
export type { GenerationError } from "./errors";
export { executeTransform } from "./transform";
export type { TransformSpec, TransformOutcome } from "./transform";
export { type GuardPolicy } from "./guards";
export { executeCore, type SongParams, type MockData } from "./core";

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

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

export async function executeGeneration(spec: GenerationSpec): Promise<GenerationOutcome> {
  const guardResult = await applyGuards(spec.guards ?? "standard", spec.userId, spec.action);
  if (guardResult.denied) return { status: "denied", response: guardResult.response };

  const { flags, rateLimitStatus } = guardResult;

  if (!spec.hasApiKey) {
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "ready",
      mock: spec.mockFallback,
    });
    if (flags.creditRecording) {
      await deductCredits(spec.userId, spec.action, {
        songId: song.id,
        description: spec.description,
      });
    }
    afterCreation(spec, song);
    return { status: "created", song, rateLimitStatus };
  }

  const outcome = await executeCore({
    userId: spec.userId,
    action: spec.action,
    songParams: spec.songParams,
    apiCall: spec.apiCall,
    description: spec.description,
    creditRecording: flags.creditRecording,
    coverArt: spec.coverArt,
  });

  switch (outcome.status) {
    case "created":
      return { status: "created", song: outcome.song, rateLimitStatus };
    case "circuit_open":
      return enqueueGeneration(spec);
    case "api_error":
      if (flags.rateLimit) {
        await releaseRateLimitSlot(spec.userId).catch(() => {});
      }
      return {
        status: "failed",
        song: outcome.song,
        error: outcome.errorMessage,
        rawError: outcome.rawError,
        rateLimitStatus,
      };
  }
}

async function enqueueGeneration(spec: GenerationSpec): Promise<GenerationOutcome> {
  logger.warn({ userId: spec.userId }, "generation: circuit open — queuing request");

  const { enqueueFromSpec } = await import("@/lib/generation-queue");
  await enqueueFromSpec(spec.userId, spec.songParams);

  return {
    status: "queued",
    message: "Music generation is temporarily unavailable. Your request has been queued and will be processed automatically when the service recovers.",
  };
}
