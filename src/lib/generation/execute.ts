import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { Song } from "@prisma/client";
import { acquireRateLimitSlot, releaseRateLimitSlot, type RateLimitStatus } from "@/lib/rate-limit";
import { rateLimited, insufficientCredits } from "@/lib/api-error";
import {
  recordCreditUsage,
  shouldNotifyLowCredits,
  createLowCreditNotification,
  getMonthlyCreditUsage,
  CREDIT_COSTS,
  type MonthlyCreditUsage,
} from "@/lib/credits";
import { logger } from "@/lib/logger";
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
): Promise<{ denied: NextResponse } | { usage: MonthlyCreditUsage }> {
  const cost = CREDIT_COSTS[action] ?? CREDIT_COSTS.generate;
  const usage = await getMonthlyCreditUsage(userId);
  if (usage.creditsRemaining < cost) {
    return {
      denied: insufficientCredits(
        `Insufficient credits. You need ${cost} credits but only have ${usage.creditsRemaining} remaining.`
      ),
    };
  }
  return { usage };
}

async function recordCreditsAndNotify(
  userId: string,
  action: string,
  opts: { songId: string; description: string }
): Promise<void> {
  const creditCost = CREDIT_COSTS[action] ?? CREDIT_COSTS.generate;
  await recordCreditUsage(userId, action, {
    songId: opts.songId,
    creditCost,
    description: opts.description,
  });

  try {
    const usage = await getMonthlyCreditUsage(userId);
    if (await shouldNotifyLowCredits(userId, usage)) {
      await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
    }
  } catch {
    // Non-critical — don't block generation
  }
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

    if (!spec.skipCreditRecording) {
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
