import { LRUCache } from "lru-cache";
import crypto from "crypto";
import { logger } from "@/lib/logger";
import { recordCacheHit, recordCacheMiss } from "@/lib/metrics";

const isDev = process.env.NODE_ENV !== "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheValue = any;

const globalForCache = globalThis as unknown as {
  __apiCache: LRUCache<string, CacheValue> | undefined;
};

export const apiCache: LRUCache<string, CacheValue> =
  globalForCache.__apiCache ??
  new LRUCache<string, CacheValue>({
    max: 500,
    ttl: 60_000, // default 60s TTL
  });

if (isDev) {
  globalForCache.__apiCache = apiCache;
}

/** Cache TTLs in milliseconds */
export const CacheTTL = {
  /** Public song data — shared across users */
  PUBLIC_SONG: 60_000, // 60s
  /** Dashboard stats — per-user, moderate staleness ok */
  DASHBOARD_STATS: 30_000, // 30s
  /** Search results — short-lived */
  SEARCH: 15_000, // 15s
  /** Tags list — rarely changes */
  TAGS: 120_000, // 2min
  /** Discover page results — public, shared, short TTL */
  DISCOVER: 60_000, // 60s
  /** Playlist list and aggregate stats — per-user */
  PLAYLIST: 30_000, // 30s
  /** Song recommendations — updated hourly */
  RECOMMENDATIONS: 3_600_000, // 1h
  /** Public user profile data (name, image, counts) — moderate staleness ok */
  USER_PROFILE: 60_000, // 60s
} as const;

/** Build a cache key from a prefix and components */
export function cacheKey(prefix: string, ...parts: (string | undefined | null)[]): string {
  return `${prefix}:${parts.filter(Boolean).join(":")}`;
}

/**
 * Get-or-set pattern for the API cache.
 * Returns cached value if present and not expired; otherwise calls fetcher,
 * stores the result, and returns it.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const hit = apiCache.get(key) as T | undefined;
  if (hit !== undefined) {
    recordCacheHit();
    logger.debug({ key }, "cache: HIT");
    return hit;
  }

  recordCacheMiss();
  logger.debug({ key }, "cache: MISS");

  const value = await fetcher();
  apiCache.set(key, value, { ttl });
  return value;
}

/**
 * Invalidate cache entries matching a prefix.
 * Use after mutations to bust stale data.
 */
export function invalidateByPrefix(prefix: string): void {
  let count = 0;
  const keys = Array.from(apiCache.keys());
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      apiCache.delete(key);
      count++;
    }
  }
  if (isDev && count > 0) {
    logger.debug({ prefix, count }, "cache: invalidated entries by prefix");
  }
}

/** Invalidate a single cache key */
export function invalidateKey(key: string): void {
  const deleted = apiCache.delete(key);
  if (isDev && deleted) {
    logger.debug({ key }, "cache: invalidated key");
  }
}

/**
 * Compute an ETag from JSON-serializable data.
 * Uses md5 for speed — not for security, just cache validation.
 */
export function computeETag(data: unknown): string {
  const hash = crypto
    .createHash("md5")
    .update(JSON.stringify(data))
    .digest("hex");
  return `"${hash}"`;
}

/**
 * Build common Cache-Control header values.
 */
export const CacheControl = {
  /** Public, cacheable data (e.g. public songs) */
  publicShort: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  /** Private user data — no shared cache */
  privateNoCache: "private, no-cache, no-store, must-revalidate",
  /** Private with short cache — user data that tolerates brief staleness */
  privateShort: "private, max-age=10, must-revalidate",
  /** Static/immutable assets */
  immutable: "public, max-age=31536000, immutable",
} as const;
