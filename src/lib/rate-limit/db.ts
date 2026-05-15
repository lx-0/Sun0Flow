import { createHash } from "crypto";
import { prisma } from "../prisma";
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
  resetAt: string;
}

// ---------------------------------------------------------------------------
// Shared kernel — concentrates retry, conflict detection, and resetAt math
// ---------------------------------------------------------------------------

function computeResetAt(entries: { createdAt: Date }[], windowMs: number): string {
  return entries.length > 0
    ? new Date(entries[0].createdAt.getTime() + windowMs).toISOString()
    : new Date(Date.now() + windowMs).toISOString();
}

function isPrismaSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "P2034"
  );
}

const MAX_RETRIES = 3;

async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isPrismaSerializationConflict(error) && attempt < MAX_RETRIES) continue;
      throw error;
    }
  }
  throw new Error("withSerializableRetry: unreachable");
}

// ---------------------------------------------------------------------------
// Read-only status check
// ---------------------------------------------------------------------------

export async function getRateLimitStatus(
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
  return {
    allowed: count < limit,
    status: {
      remaining: Math.max(0, limit - count),
      limit,
      resetAt: computeResetAt(entries, WINDOW_MS),
    },
  };
}

/** @deprecated Use getRateLimitStatus — identical behaviour, clearer name. */
export const checkRateLimit = getRateLimitStatus;

// ---------------------------------------------------------------------------
// Slot release
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PII-safe hashing
// ---------------------------------------------------------------------------

export function hashRateLimitKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Atomic slot acquisition
// ---------------------------------------------------------------------------

export async function acquireAnonRateLimitSlot(
  rawKey: string,
  action: string,
  limit: number,
  windowMs: number
): Promise<{ acquired: boolean; status: RateLimitStatus }> {
  const key = hashRateLimitKey(rawKey);
  const windowStart = new Date(Date.now() - windowMs);

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const entries = await tx.anonRateLimitEntry.findMany({
          where: { key, action, createdAt: { gte: windowStart } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        const count = entries.length;
        const resetAt = computeResetAt(entries, windowMs);

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
    )
  );
}

export async function acquireRateLimitSlot(
  userId: string,
  action = "generate",
  limitOverride?: number,
  windowMsOverride?: number
): Promise<{ acquired: boolean; status: RateLimitStatus }> {
  const limit = limitOverride ?? (await resolveLimit(userId, action));
  const windowMs = windowMsOverride ?? WINDOW_MS;
  const windowStart = new Date(Date.now() - windowMs);

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const entries = await tx.rateLimitEntry.findMany({
          where: { userId, action, createdAt: { gte: windowStart } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        const count = entries.length;
        const resetAt = computeResetAt(entries, windowMs);

        if (count >= limit) {
          return { acquired: false, status: { remaining: 0, limit, resetAt } };
        }

        await tx.rateLimitEntry.create({ data: { userId, action } });
        return {
          acquired: true,
          status: { remaining: Math.max(0, limit - count - 1), limit, resetAt },
        };
      },
      { isolationLevel: "Serializable" }
    )
  );
}
