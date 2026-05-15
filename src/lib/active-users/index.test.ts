import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import {
  countActiveUsers,
  listActiveUserIds,
  dailyActiveUserCounts,
} from "./index";

const since = new Date("2026-05-01T00:00:00.000Z");

beforeEach(() => {
  mockQueryRaw.mockReset();
});

describe("countActiveUsers", () => {
  it("returns the bigint count coerced to a number", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(42) }]);
    expect(await countActiveUsers(since)).toBe(42);
  });

  it("returns 0 when no rows are returned", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    expect(await countActiveUsers(since)).toBe(0);
  });

  it("queries Activity and PlayHistory in a UNION", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);
    await countActiveUsers(since);
    const sqlFragments = mockQueryRaw.mock.calls[0][0] as TemplateStringsArray;
    const joined = sqlFragments.join("?");
    expect(joined).toContain('"Activity"');
    expect(joined).toContain('"PlayHistory"');
    expect(joined).toContain("UNION ALL");
    expect(joined).toContain("DISTINCT");
  });
});

describe("listActiveUserIds", () => {
  it("flattens rows to a userId array", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "u3" },
    ]);
    expect(await listActiveUserIds(since)).toEqual(["u1", "u2", "u3"]);
  });

  it("returns an empty array when nobody is active", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    expect(await listActiveUserIds(since)).toEqual([]);
  });
});

describe("dailyActiveUserCounts", () => {
  it("formats dates as YYYY-MM-DD and coerces bigints", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { date: new Date("2026-05-01T00:00:00.000Z"), count: BigInt(3) },
      { date: new Date("2026-05-02T00:00:00.000Z"), count: BigInt(7) },
    ]);
    expect(await dailyActiveUserCounts(since)).toEqual([
      { date: "2026-05-01", count: 3 },
      { date: "2026-05-02", count: 7 },
    ]);
  });

  it("returns an empty array when no buckets exist", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    expect(await dailyActiveUserCounts(since)).toEqual([]);
  });
});
