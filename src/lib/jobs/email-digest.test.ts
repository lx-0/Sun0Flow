import { describe, it, expect } from "vitest";
import { selectRecommendations } from "./email-digest";

interface TrendingCandidate {
  id: string;
  title: string | null;
  tags: string | null;
  userId: string;
}

function candidate(overrides: Partial<TrendingCandidate> = {}): TrendingCandidate {
  return {
    id: "song-1",
    title: "Song 1",
    tags: "pop, upbeat",
    userId: "other-user",
    ...overrides,
  };
}

describe("selectRecommendations", () => {
  it("returns empty array for empty pool", () => {
    expect(selectRecommendations([], "user-1")).toEqual([]);
  });

  it("excludes songs by the target user", () => {
    const pool = [
      candidate({ id: "s1", userId: "user-1" }),
      candidate({ id: "s2", userId: "user-2" }),
      candidate({ id: "s3", userId: "user-1" }),
    ];
    const result = selectRecommendations(pool, "user-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("caps at 5 recommendations", () => {
    const pool = Array.from({ length: 10 }, (_, i) =>
      candidate({ id: `s${i}`, userId: `other-${i}` })
    );
    expect(selectRecommendations(pool, "user-1")).toHaveLength(5);
  });

  it("preserves pool ordering", () => {
    const pool = [
      candidate({ id: "s1", userId: "a", title: "First" }),
      candidate({ id: "s2", userId: "b", title: "Second" }),
      candidate({ id: "s3", userId: "c", title: "Third" }),
    ];
    const result = selectRecommendations(pool, "user-1");
    expect(result.map((r) => r.title)).toEqual(["First", "Second", "Third"]);
  });

  it("only returns id, title, and tags", () => {
    const pool = [candidate({ id: "s1", userId: "other", title: "T", tags: "rock" })];
    const result = selectRecommendations(pool, "user-1");
    expect(result[0]).toEqual({ id: "s1", title: "T", tags: "rock" });
  });

  it("handles null tags", () => {
    const pool = [candidate({ id: "s1", tags: null })];
    const result = selectRecommendations(pool, "user-1");
    expect(result[0].tags).toBeNull();
  });
});
