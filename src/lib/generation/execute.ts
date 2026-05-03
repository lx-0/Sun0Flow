import type { Song } from "@prisma/client";
import type { RateLimitStatus } from "@/lib/rate-limit";
import { releaseRateLimitSlot } from "@/lib/rate-limit";
import { enforceRateLimit } from "./rate-limit-guard";
import { checkCreditBalance, recordCreditsAndNotify } from "./credit-guard";
import { createSongRecord, type SongParams, type MockData } from "./song-record";
import { userFriendlyError } from "./errors";

export interface GenerationSpec {
  userId: string;
  action: string;
  songParams: SongParams;
  apiCall: () => Promise<{ taskId: string }>;
  mockFallback: MockData;
  hasApiKey: boolean;
  description: string;
  skipCredits?: boolean;
  skipRateLimit?: boolean;
  rethrow?: (error: unknown) => boolean;
}

export type GenerationOutcome =
  | { status: "denied"; response: Response }
  | { status: "created"; song: Song; rateLimitStatus?: RateLimitStatus }
  | { status: "failed"; song: Song; error: string; rawError: unknown; rateLimitStatus?: RateLimitStatus };

export async function executeGeneration(spec: GenerationSpec): Promise<GenerationOutcome> {
  let rateLimitStatus: RateLimitStatus | undefined;

  if (!spec.skipRateLimit) {
    const result = await enforceRateLimit(spec.userId, spec.action);
    if (result.limited) return { status: "denied", response: result.response };
    rateLimitStatus = result.status;
  }

  if (!spec.skipCredits) {
    const denied = await checkCreditBalance(spec.userId, spec.action);
    if (denied) return { status: "denied", response: denied };
  }

  if (!spec.hasApiKey) {
    const song = await createSongRecord(spec.userId, spec.songParams, {
      status: "ready",
      mock: spec.mockFallback,
    });
    if (!spec.skipCredits) {
      await recordCreditsAndNotify(spec.userId, spec.action, {
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

    if (!spec.skipCredits) {
      await recordCreditsAndNotify(spec.userId, spec.action, {
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
