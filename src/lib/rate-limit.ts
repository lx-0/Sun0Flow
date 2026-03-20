import { prisma } from "./prisma";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_REQUESTS = 10;

function getMaxRequests(): number {
  const envVal = process.env.RATE_LIMIT_MAX_GENERATIONS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_REQUESTS;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string; // ISO timestamp of when the oldest entry in the window expires
}

export async function checkRateLimit(
  userId: string,
  action = "generate"
): Promise<{ allowed: boolean; status: RateLimitStatus }> {
  const limit = getMaxRequests();
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const entries = await prisma.rateLimitEntry.findMany({
    where: { userId, action, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const count = entries.length;
  const remaining = Math.max(0, limit - count);

  // resetAt = when the oldest entry falls out of the window
  const resetAt =
    count > 0
      ? new Date(entries[0].createdAt.getTime() + WINDOW_MS).toISOString()
      : new Date(Date.now() + WINDOW_MS).toISOString();

  return {
    allowed: count < limit,
    status: { remaining, limit, resetAt },
  };
}

export async function recordRateLimitHit(
  userId: string,
  action = "generate"
): Promise<void> {
  await prisma.rateLimitEntry.create({
    data: { userId, action },
  });
}
