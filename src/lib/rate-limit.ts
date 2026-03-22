import { prisma } from "./prisma";
import { RATE_LIMIT_MAX_GENERATIONS } from "@/lib/env";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const ACTION_LIMITS: Record<string, number> = {
  generate: RATE_LIMIT_MAX_GENERATIONS,
  download: 50,
  report: 10,
  password_reset: 3,
  verification_email: 3,
};

function getMaxRequests(action = "generate"): number {
  return ACTION_LIMITS[action] ?? RATE_LIMIT_MAX_GENERATIONS;
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
  const limit = getMaxRequests(action);
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

/**
 * Atomically check-and-increment the rate limit in a single transaction.
 * Returns { acquired: true, status } if a slot was claimed, or
 * { acquired: false, status } if the limit was already reached.
 *
 * Uses SERIALIZABLE isolation to prevent TOCTOU races: concurrent requests
 * that both read "1 slot remaining" will serialize — only one succeeds.
 */
export async function acquireRateLimitSlot(
  userId: string,
  action = "generate"
): Promise<{ acquired: boolean; status: RateLimitStatus }> {
  const limit = getMaxRequests(action);
  const windowStart = new Date(Date.now() - WINDOW_MS);

  return prisma.$transaction(
    async (tx) => {
      const entries = await tx.rateLimitEntry.findMany({
        where: { userId, action, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      const count = entries.length;

      if (count >= limit) {
        // Limit reached — do not insert
        const resetAt =
          count > 0
            ? new Date(entries[0].createdAt.getTime() + WINDOW_MS).toISOString()
            : new Date(Date.now() + WINDOW_MS).toISOString();
        return {
          acquired: false,
          status: { remaining: 0, limit, resetAt },
        };
      }

      // Claim the slot
      await tx.rateLimitEntry.create({ data: { userId, action } });

      const remaining = Math.max(0, limit - count - 1);
      const resetAt =
        count > 0
          ? new Date(entries[0].createdAt.getTime() + WINDOW_MS).toISOString()
          : new Date(Date.now() + WINDOW_MS).toISOString();

      return {
        acquired: true,
        status: { remaining, limit, resetAt },
      };
    },
    { isolationLevel: "Serializable" }
  );
}
