import type { RateLimitMeta, RateLimitStatus } from "./types";

const PROMPT_LIMIT = 3000;

export function getPromptValidationError(promptValue: string, customMode: boolean): string | null {
  if (!promptValue.trim()) {
    return customMode ? "Lyrics are required" : "Style / genre is required";
  }

  if (promptValue.length > PROMPT_LIMIT) {
    return `Prompt must be ${PROMPT_LIMIT} characters or less`;
  }

  return null;
}

export function reorderPendingQueueIds(
  pendingIds: string[],
  pendingIndex: number,
  direction: "up" | "down",
): string[] {
  const nextIds = [...pendingIds];

  if (direction === "up") {
    if (pendingIndex <= 0) return nextIds;
    [nextIds[pendingIndex - 1], nextIds[pendingIndex]] = [nextIds[pendingIndex], nextIds[pendingIndex - 1]];
    return nextIds;
  }

  if (pendingIndex < 0 || pendingIndex >= nextIds.length - 1) return nextIds;
  [nextIds[pendingIndex], nextIds[pendingIndex + 1]] = [nextIds[pendingIndex + 1], nextIds[pendingIndex]];
  return nextIds;
}

export function getRateLimitMeta(rateLimit: RateLimitStatus): RateLimitMeta {
  const used = rateLimit.limit - rateLimit.remaining;
  const pct = rateLimit.limit > 0 ? Math.round((used / rateLimit.limit) * 100) : 0;
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-green-500";
  const minsLeft = Math.max(0, Math.ceil((new Date(rateLimit.resetAt).getTime() - Date.now()) / 60000));
  const isAtLimit = rateLimit.remaining === 0;

  return {
    used,
    pct,
    barColor,
    minsLeft,
    isAtLimit,
    isNearLimit: pct >= 80 && !isAtLimit,
  };
}
