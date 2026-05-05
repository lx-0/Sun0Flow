import type { RateLimitStatus } from "@/lib/rate-limit";
import { acquireRateLimitSlot, releaseRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { userFriendlyError } from "./errors";

export interface TransformSpec {
  userId: string;
  action: string;
  apiCall: () => Promise<{ taskId: string }>;
  hasApiKey: boolean;
  mockTaskId: string;
  fallbackErrorMessage?: string;
}

export type TransformOutcome =
  | { status: "denied"; response: Response }
  | { status: "completed"; taskId: string; mockMode: boolean; rateLimitStatus: RateLimitStatus }
  | { status: "failed"; error: string; rawError: unknown; rateLimitStatus: RateLimitStatus };

export async function executeTransform(spec: TransformSpec): Promise<TransformOutcome> {
  const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(spec.userId, spec.action || "generate");
  if (!acquired) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000)
    );
    logger.warn(
      { userId: spec.userId, action: spec.action, limit: rateLimitStatus.limit, resetAt: rateLimitStatus.resetAt },
      "rate-limit: transform limit exceeded"
    );
    Sentry.addBreadcrumb({
      category: "rate-limit",
      message: "Transform rate limit exceeded",
      level: "warning",
      data: { userId: spec.userId, action: spec.action },
    });
    return {
      status: "denied",
      response: rateLimited(
        `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
        { resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { "Retry-After": String(retryAfterSec) }
      ),
    };
  }

  if (!spec.hasApiKey) {
    return { status: "completed", taskId: spec.mockTaskId, mockMode: true, rateLimitStatus };
  }

  try {
    const result = await spec.apiCall();
    return { status: "completed", taskId: result.taskId, mockMode: false, rateLimitStatus };
  } catch (apiError) {
    await releaseRateLimitSlot(spec.userId).catch(() => {});
    const { message: errorMsg } = userFriendlyError(apiError, spec.fallbackErrorMessage);
    return { status: "failed", error: errorMsg, rawError: apiError, rateLimitStatus };
  }
}
