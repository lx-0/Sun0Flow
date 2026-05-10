import type { RateLimitStatus } from "@/lib/rate-limit";
import { releaseRateLimitSlot } from "@/lib/rate-limit";
import { applyGuards, type GuardPolicy } from "./guards";
import { userFriendlyError } from "./errors";

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
  const guardResult = await applyGuards(spec.guards ?? "free", spec.userId, spec.action);
  if (guardResult.denied) return { status: "denied", response: guardResult.response };

  const { flags, rateLimitStatus } = guardResult;

  if (!spec.hasApiKey) {
    return { status: "completed", taskId: spec.mockTaskId, mockMode: true, rateLimitStatus };
  }

  try {
    const result = await spec.apiCall();
    return { status: "completed", taskId: result.taskId, mockMode: false, rateLimitStatus };
  } catch (apiError) {
    if (flags.rateLimit) {
      await releaseRateLimitSlot(spec.userId).catch(() => {});
    }
    const { message: errorMsg } = userFriendlyError(apiError, spec.fallbackErrorMessage);
    return { status: "failed", error: errorMsg, rawError: apiError, rateLimitStatus };
  }
}
