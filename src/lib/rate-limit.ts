import { createHash } from "crypto";
import { prisma } from "./prisma";
import { RATE_LIMIT_MAX_GENERATIONS } from "@/lib/env";
import { TIER_LIMITS } from "@/lib/billing";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const ACTION_LIMITS: Record<string, number> = {
  generate: RATE_LIMIT_MAX_GENERATIONS,
  lyrics_generate: 10,
  download: 50,
  report: 10,
  password_reset: 3,
  verification_email: 3,
  search: 60,
};

/**
 * Get the hourly generation limit for a user based on their subscription tier.
 */
export async function getHourlyGenerationLimit(userId: string): Promise<number> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, status: true },
  });

  if (!sub || sub.status !== "active") {
    return TIER_LIMITS.free.generationsPerHour;
  }

  return TIER_LIMITS[sub.tier].generationsPerHour;
}

async function resolveLimit(userId: string, action: string): Promise<number> {
  if (action === "generate") {
    return getHourlyGenerationLimit(userId);
  }
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
  const limit = await resolveLimit(userId, action);
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
 * Release the most recently acquired rate limit slot for a user/action.
 * Call this in catch blocks so a failed generation doesn't consume one of
 * the user's hourly slots.
 */
export async function releaseRateLimitSlot(
  userId: string,
  action = "generate"
): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const entry = await prisma.rateLimitEntry.findFirst({
    where: { userId, action, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (entry) {
    await prisma.rateLimitEntry.delete({ where: { id: entry.id } });
  }
}

/**
 * Hash a raw key (IP address, email, etc.) so we never store PII in the table.
 */
export function hashRateLimitKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Atomically check-and-increment an anonymous (non-user) rate limit slot.
 * Used for unauthenticated endpoints (e.g., /api/register) where no userId exists.
 *
 * @param rawKey   Raw identifier (IP, email) — will be SHA-256-hashed before storage.
 * @param action   Action label (e.g., "register").
 * @param limit    Maximum number of requests allowed in the window.
 * @param windowMs Window duration in milliseconds.
 */
export async function acquireAnonRateLimitSlot(
  rawKey: string,
  action: string,
  limit: number,
  windowMs: number
): Promise<{ acquired: boolean; status: RateLimitStatus }> {
  const key = hashRateLimitKey(rawKey);
  const windowStart = new Date(Date.now() - windowMs);

  return prisma.$transaction(
    async (tx) => {
      const entries = await tx.anonRateLimitEntry.findMany({
        where: { key, action, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      const count = entries.length;
      const resetAt =
        count > 0
          ? new Date(entries[0].createdAt.getTime() + windowMs).toISOString()
          : new Date(Date.now() + windowMs).toISOString();

      if (count >= limit) {
        return { acquired: false, status: { remaining: 0, limit, resetAt } };
      }

      await tx.anonRateLimitEntry.create({ data: { key, action } });

      return {
        acquired: true,
        status: { remaining: Math.max(0, limit - count - 1), limit, resetAt },
      };
    },
    { isolationLevel: "Serializable" }
  );
}

/**
 * Atomically check-and-increment the rate limit in a single transaction.
 * Returns { acquired: true, status } if a slot was claimed, or
 * { acquired: false, status } if the limit was already reached.
 *
 * Uses SERIALIZABLE isolation to prevent TOCTOU races: concurrent requests
 * that both read "1 slot remaining" will serialize — only one succeeds.
 *
 * @param windowMsOverride  Override the default 1-hour window (e.g., 60_000 for 1 minute).
 */
export async function acquireRateLimitSlot(
  userId: string,
  action = "generate",
  limitOverride?: number,
  windowMsOverride?: number
): Promise<{ acquired: boolean; status: RateLimitStatus }> {
  const limit = limitOverride ?? (await resolveLimit(userId, action));
  const windowMs = windowMsOverride ?? WINDOW_MS;
  const windowStart = new Date(Date.now() - windowMs);

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
            ? new Date(entries[0].createdAt.getTime() + windowMs).toISOString()
            : new Date(Date.now() + windowMs).toISOString();
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
          ? new Date(entries[0].createdAt.getTime() + windowMs).toISOString()
          : new Date(Date.now() + windowMs).toISOString();

      return {
        acquired: true,
        status: { remaining, limit, resetAt },
      };
    },
    { isolationLevel: "Serializable" }
  );
}
