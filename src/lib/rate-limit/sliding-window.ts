/**
 * In-memory sliding-window rate limiting for Next.js middleware.
 *
 * Two layers:
 *   1. IP-based — throttles unauthenticated/public page requests.
 *   2. Per-user — throttles authenticated API requests.
 *
 * Both use in-process Maps with periodic eviction. For multi-instance
 * deployments, replace these Maps with Redis sorted sets:
 *   ZADD  <key> <now> <requestId>
 *   ZREMRANGEBYSCORE <key> 0 <windowStart>
 *   ZCARD <key>   → current count
 *   EXPIRE <key> 120   → TTL to auto-cleanup
 * Use a key like `rl:<userId>:<bucket>`. Atomic pipelines (MULTI/EXEC or
 * Lua scripts) prevent TOCTOU races under concurrent load.
 */

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Sliding-window core
// ---------------------------------------------------------------------------

const WINDOW_MS = 60 * 1000; // 1 minute

const ipHits = new Map<string, Map<string, number[]>>();
const userHits = new Map<string, Map<string, number[]>>();

interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

function checkWindow(
  store: Map<string, Map<string, number[]>>,
  key: string,
  bucket: string,
  max: number,
  maxStoreSize: number
): SlidingWindowResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let buckets = store.get(key);
  if (!buckets) {
    buckets = new Map();
    store.set(key, buckets);
  }

  const hits = (buckets.get(bucket) ?? []).filter((t: number) => t > windowStart);

  if (hits.length >= max) {
    const oldestHit = hits[0];
    const retryAfterMs = oldestHit + WINDOW_MS - now;
    return {
      allowed: false,
      remaining: 0,
      limit: max,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  hits.push(now);
  buckets.set(bucket, hits);

  // Periodically evict stale entries to prevent memory growth
  if (store.size > maxStoreSize) {
    store.forEach((b, k) => {
      b.forEach((timestamps, bk) => {
        const recent = timestamps.filter((t: number) => t > windowStart);
        if (recent.length === 0) b.delete(bk);
        else b.set(bk, recent);
      });
      if (b.size === 0) store.delete(k);
    });
  }

  return {
    allowed: true,
    remaining: Math.max(0, max - hits.length),
    limit: max,
    retryAfterSec: 0,
  };
}

// ---------------------------------------------------------------------------
// IP bucket configuration
//
// Bucket     | Max | Applies To
// ---------- | --- | --------------------------------
// public     |  30 | /s/* (public share pages)
// playlist   | 100 | /p/* (public playlist pages)
// profile    |  60 | /u/* (public user profiles)
// songs      |  60 | /songs/* (public song-by-id pages)
// embed      | 200 | /embed/* (embed player pages)
// auth       |  10 | /api/register, forgot/reset password, signin
// ---------------------------------------------------------------------------

interface IpBucket {
  bucket: string;
  max: number;
  match: (pathname: string) => boolean;
}

const AUTH_PATHS = new Set([
  "/api/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/signin",
  "/api/auth/callback/credentials",
]);

const IP_BUCKETS: IpBucket[] = [
  { bucket: "public", max: 30, match: (p) => p.startsWith("/s/") },
  { bucket: "playlist", max: 100, match: (p) => p.startsWith("/p/") },
  { bucket: "profile", max: 60, match: (p) => p.startsWith("/u/") },
  { bucket: "songs", max: 60, match: (p) => p.startsWith("/songs/") },
  { bucket: "embed", max: 200, match: (p) => p.startsWith("/embed/") },
  {
    bucket: "auth",
    max: 10,
    match: (p) => process.env.CI !== "true" && AUTH_PATHS.has(p),
  },
];

// ---------------------------------------------------------------------------
// Per-user bucket configuration
//
// Bucket     | Max | Applies To
// ---------- | --- | -----------------------------------------
// generate   |  10 | POST /api/generate (expensive operation)
// auth_user  |   5 | Auth mutation endpoints (per user)
// api        | 100 | All authenticated /api/* routes (catch-all)
// ---------------------------------------------------------------------------

const USER_AUTH_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

interface UserBucketMatch {
  bucket: string;
  max: number;
}

function matchUserBuckets(pathname: string, method: string): UserBucketMatch[] {
  const buckets: UserBucketMatch[] = [];

  if (pathname === "/api/generate" && method === "POST") {
    buckets.push({ bucket: "generate", max: 10 });
  }

  if (USER_AUTH_PATHS.has(pathname)) {
    buckets.push({ bucket: "auth_user", max: 5 });
  }

  // General API catch-all (always applied last for authenticated /api/* requests)
  buckets.push({ bucket: "api", max: 100 });

  return buckets;
}

// ---------------------------------------------------------------------------
// Public API — single function for middleware to call
// ---------------------------------------------------------------------------

export interface RequestRateLimitParams {
  pathname: string;
  method: string;
  ip: string;
  userId?: string;
  isAdmin?: boolean;
  isE2eUser?: boolean;
}

/**
 * Apply all middleware-layer rate limits for a request.
 *
 * Returns a 429 NextResponse if any limit is exceeded, or null if the
 * request is allowed through. The middleware should return the response
 * directly when non-null.
 */
export function applyRequestRateLimits(
  params: RequestRateLimitParams
): NextResponse | null {
  const { pathname, method, ip, userId, isAdmin, isE2eUser } = params;

  // ── IP-based rate limits (public/unauthenticated pages) ──────────────
  for (const { bucket, max, match } of IP_BUCKETS) {
    if (!match(pathname)) continue;

    const result = checkWindow(ipHits, ip, bucket, max, 10_000);
    if (!result.allowed) {
      const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      };
      if (result.retryAfterSec > 0) {
        headers["Retry-After"] = String(result.retryAfterSec);
      }

      const isAuthBucket = bucket === "auth";
      if (isAuthBucket) {
        console.warn(`[rate-limit] auth IP limit exceeded ip=${ip} path=${pathname}`);
        headers["Retry-After"] = "60";
      }

      return NextResponse.json(
        {
          error: isAuthBucket
            ? "Too many requests. Please try again later."
            : "Too many requests",
          ...(isAuthBucket ? { code: "RATE_LIMITED" } : {}),
        },
        { status: 429, headers }
      );
    }
  }

  // ── Per-user rate limits (authenticated API routes) ──────────────────
  // Admin users and E2E test users are exempt.
  if (
    userId &&
    !isAdmin &&
    !isE2eUser &&
    pathname.startsWith("/api/") &&
    process.env.PLAYWRIGHT_TEST !== "true"
  ) {
    const buckets = matchUserBuckets(pathname, method);

    for (const { bucket, max } of buckets) {
      const result = checkWindow(userHits, userId, bucket, max, 50_000);
      if (!result.allowed) {
        const label =
          bucket === "generate" ? "generation" : bucket === "auth_user" ? "auth_user" : "api";
        console.warn(`[rate-limit] ${label} user limit exceeded userId=${userId}`);

        const messages: Record<string, string> = {
          generate: "Too many generation requests. Please wait before trying again.",
          auth_user: "Too many requests. Please wait before trying again.",
          api: "Too many requests. Please slow down.",
        };

        return NextResponse.json(
          { error: messages[bucket], code: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.retryAfterSec),
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
    }
  }

  return null;
}
