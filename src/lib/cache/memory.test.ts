import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  apiCache,
  cacheKey,
  cached,
  invalidateByPrefix,
  invalidateKey,
  computeETag,
  CacheTTL,
  CacheControl,
} from "./memory";

beforeEach(() => {
  // Clear cache between tests
  apiCache.clear();
});

describe("cacheKey", () => {
  it("builds key from prefix and parts", () => {
    expect(cacheKey("songs", "user-1")).toBe("songs:user-1");
    expect(cacheKey("dashboard-stats", "user-1", "2026")).toBe("dashboard-stats:user-1:2026");
  });

  it("filters out null and undefined parts", () => {
    expect(cacheKey("songs", "user-1", undefined, null, "page-1")).toBe("songs:user-1:page-1");
  });

  it("handles empty parts", () => {
    expect(cacheKey("prefix")).toBe("prefix:");
  });
});

describe("cached", () => {
  it("calls fetcher on cache miss and returns result", async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: "fresh" });
    const result = await cached("test-key", fetcher);
    expect(result).toEqual({ data: "fresh" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on subsequent calls without calling fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");
    await cached("cache-hit-key", fetcher);
    const result = await cached("cache-hit-key", fetcher);
    expect(result).toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1); // only called once
  });

  it("stores value in cache after fetching", async () => {
    await cached("store-test", async () => 42);
    expect(apiCache.get("store-test")).toBe(42);
  });

  it("accepts custom TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue("ttl-value");
    await cached("ttl-key", fetcher, 5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateByPrefix", () => {
  it("removes all keys with the given prefix", () => {
    apiCache.set("user:1:profile", { name: "Alice" });
    apiCache.set("user:1:songs", ["song1"]);
    apiCache.set("user:2:profile", { name: "Bob" });

    invalidateByPrefix("user:1:");

    expect(apiCache.has("user:1:profile")).toBe(false);
    expect(apiCache.has("user:1:songs")).toBe(false);
    expect(apiCache.has("user:2:profile")).toBe(true);
  });

  it("does nothing when no matching keys", () => {
    apiCache.set("other:key", "value");
    invalidateByPrefix("nonexistent:");
    expect(apiCache.has("other:key")).toBe(true);
  });
});

describe("invalidateKey", () => {
  it("removes the specific key", () => {
    apiCache.set("specific-key", "value");
    invalidateKey("specific-key");
    expect(apiCache.has("specific-key")).toBe(false);
  });

  it("does nothing for non-existent key", () => {
    invalidateKey("no-such-key");
    // Should not throw
  });
});

describe("computeETag", () => {
  it("returns a quoted md5 hash", () => {
    const etag = computeETag({ id: 1, name: "test" });
    expect(etag).toMatch(/^"[a-f0-9]{32}"$/);
  });

  it("returns the same ETag for the same data", () => {
    const etag1 = computeETag([1, 2, 3]);
    const etag2 = computeETag([1, 2, 3]);
    expect(etag1).toBe(etag2);
  });

  it("returns different ETags for different data", () => {
    const etag1 = computeETag({ a: 1 });
    const etag2 = computeETag({ a: 2 });
    expect(etag1).not.toBe(etag2);
  });
});

describe("CacheTTL", () => {
  it("has expected TTL values", () => {
    expect(CacheTTL.PUBLIC_SONG).toBe(60_000);
    expect(CacheTTL.DASHBOARD_STATS).toBe(30_000);
    expect(CacheTTL.SEARCH).toBe(15_000);
    expect(CacheTTL.TAGS).toBe(120_000);
  });
});

describe("CacheControl", () => {
  it("has expected cache-control strings", () => {
    expect(CacheControl.publicShort).toContain("public");
    expect(CacheControl.privateNoCache).toContain("no-cache");
    expect(CacheControl.privateShort).toContain("private");
    expect(CacheControl.immutable).toContain("immutable");
  });
});
