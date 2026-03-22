import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, recordRateLimitHit, acquireRateLimitSlot } from "./rate-limit";

// ─── Mock Prisma ────────────────────────────────────────────────────────────

const mockFindMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    rateLimitEntry: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
      fn({
        rateLimitEntry: {
          findMany: (...args: unknown[]) => mockFindMany(...args),
          create: (...args: unknown[]) => mockCreate(...args),
        },
      }),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(minutesAgo: number) {
  return { createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T12:00:00.000Z"));
    mockFindMany.mockReset();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RATE_LIMIT_MAX_GENERATIONS;
  });

  describe("checkRateLimit", () => {
    it("allows requests when under the limit", async () => {
      mockFindMany.mockResolvedValue([makeEntry(30), makeEntry(15)]);

      const result = await checkRateLimit("user-1");

      expect(result.allowed).toBe(true);
      expect(result.status.remaining).toBe(8);
      expect(result.status.limit).toBe(10);
    });

    it("blocks requests when at the limit", async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry(50 - i * 5)
      );
      mockFindMany.mockResolvedValue(entries);

      const result = await checkRateLimit("user-1");

      expect(result.allowed).toBe(false);
      expect(result.status.remaining).toBe(0);
    });

    it("blocks requests when over the limit", async () => {
      const entries = Array.from({ length: 12 }, (_, i) =>
        makeEntry(55 - i * 4)
      );
      mockFindMany.mockResolvedValue(entries);

      const result = await checkRateLimit("user-1");

      expect(result.allowed).toBe(false);
      expect(result.status.remaining).toBe(0);
    });

    it("returns full remaining when no entries exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await checkRateLimit("user-1");

      expect(result.allowed).toBe(true);
      expect(result.status.remaining).toBe(10);
      expect(result.status.limit).toBe(10);
    });

    it("uses configurable limit from RATE_LIMIT_MAX_GENERATIONS", async () => {
      process.env.RATE_LIMIT_MAX_GENERATIONS = "5";
      mockFindMany.mockResolvedValue([makeEntry(30), makeEntry(15)]);

      const result = await checkRateLimit("user-1");

      expect(result.status.limit).toBe(5);
      expect(result.status.remaining).toBe(3);
    });

    it("ignores invalid RATE_LIMIT_MAX_GENERATIONS values", async () => {
      process.env.RATE_LIMIT_MAX_GENERATIONS = "abc";
      mockFindMany.mockResolvedValue([]);

      const result = await checkRateLimit("user-1");

      expect(result.status.limit).toBe(10);
    });

    it("ignores zero or negative RATE_LIMIT_MAX_GENERATIONS", async () => {
      process.env.RATE_LIMIT_MAX_GENERATIONS = "0";
      mockFindMany.mockResolvedValue([]);

      const result = await checkRateLimit("user-1");

      expect(result.status.limit).toBe(10);
    });

    it("calculates resetAt from the oldest entry in the window", async () => {
      // Oldest entry was 45 minutes ago → resets in 15 minutes
      mockFindMany.mockResolvedValue([makeEntry(45), makeEntry(10)]);

      const result = await checkRateLimit("user-1");
      const resetAt = new Date(result.status.resetAt);
      const expectedReset = new Date(Date.now() - 45 * 60 * 1000 + 60 * 60 * 1000);

      expect(resetAt.getTime()).toBe(expectedReset.getTime());
    });

    it("sets resetAt to now + 1 hour when no entries exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await checkRateLimit("user-1");
      const resetAt = new Date(result.status.resetAt);
      const expectedReset = new Date(Date.now() + 60 * 60 * 1000);

      expect(resetAt.getTime()).toBe(expectedReset.getTime());
    });

    it("queries with the correct rolling window", async () => {
      mockFindMany.mockResolvedValue([]);

      await checkRateLimit("user-1", "generate");

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          action: "generate",
          createdAt: { gte: expect.any(Date) },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      const windowStart = mockFindMany.mock.calls[0][0].where.createdAt.gte;
      const expectedWindowStart = new Date(Date.now() - 60 * 60 * 1000);
      expect(windowStart.getTime()).toBe(expectedWindowStart.getTime());
    });

    it("supports custom action parameter", async () => {
      mockFindMany.mockResolvedValue([]);

      await checkRateLimit("user-1", "custom_action");

      expect(mockFindMany.mock.calls[0][0].where.action).toBe("custom_action");
    });

    it("allows exactly limit-1 requests (boundary test)", async () => {
      const entries = Array.from({ length: 9 }, (_, i) =>
        makeEntry(50 - i * 5)
      );
      mockFindMany.mockResolvedValue(entries);

      const result = await checkRateLimit("user-1");

      expect(result.allowed).toBe(true);
      expect(result.status.remaining).toBe(1);
    });
  });

  describe("recordRateLimitHit", () => {
    it("creates a rate limit entry", async () => {
      mockCreate.mockResolvedValue({ id: "entry-1" });

      await recordRateLimitHit("user-1");

      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", action: "generate" },
      });
    });

    it("uses custom action parameter", async () => {
      mockCreate.mockResolvedValue({ id: "entry-2" });

      await recordRateLimitHit("user-1", "custom_action");

      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", action: "custom_action" },
      });
    });
  });

  describe("acquireRateLimitSlot", () => {
    it("acquires a slot and inserts entry when under the limit", async () => {
      mockFindMany.mockResolvedValue([makeEntry(30), makeEntry(15)]);
      mockCreate.mockResolvedValue({ id: "entry-new" });

      const result = await acquireRateLimitSlot("user-1");

      expect(result.acquired).toBe(true);
      expect(result.status.remaining).toBe(7); // 10 - 2 existing - 1 just claimed
      expect(result.status.limit).toBe(10);
      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", action: "generate" },
      });
    });

    it("refuses when at the limit and does not insert", async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry(50 - i * 5)
      );
      mockFindMany.mockResolvedValue(entries);

      const result = await acquireRateLimitSlot("user-1");

      expect(result.acquired).toBe(false);
      expect(result.status.remaining).toBe(0);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("acquires last slot when exactly one remains", async () => {
      const entries = Array.from({ length: 9 }, (_, i) =>
        makeEntry(50 - i * 5)
      );
      mockFindMany.mockResolvedValue(entries);
      mockCreate.mockResolvedValue({ id: "entry-last" });

      const result = await acquireRateLimitSlot("user-1");

      expect(result.acquired).toBe(true);
      expect(result.status.remaining).toBe(0); // 10 - 9 - 1 = 0
      expect(mockCreate).toHaveBeenCalled();
    });

    it("acquires a slot with no prior entries", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({ id: "entry-first" });

      const result = await acquireRateLimitSlot("user-1");

      expect(result.acquired).toBe(true);
      expect(result.status.remaining).toBe(9); // 10 - 0 - 1
      expect(result.status.limit).toBe(10);
    });

    it("supports custom action parameter", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({ id: "entry-dl" });

      const result = await acquireRateLimitSlot("user-1", "download");

      expect(result.acquired).toBe(true);
      expect(result.status.limit).toBe(50);
      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", action: "download" },
      });
    });
  });
});
