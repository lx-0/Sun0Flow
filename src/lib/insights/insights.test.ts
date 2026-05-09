import { describe, it, expect } from "vitest";
import {
  computeTagBreakdown,
  computeComboBreakdown,
  buildWeeklyTrend,
} from ".";

describe("computeTagBreakdown", () => {
  it("counts likes and dislikes per tag", () => {
    const rows = [
      { rating: "thumbs_up", song: { tags: "rock, pop" } },
      { rating: "thumbs_down", song: { tags: "rock, jazz" } },
      { rating: "thumbs_up", song: { tags: "pop" } },
    ];
    const result = computeTagBreakdown(rows);
    const rock = result.find((t) => t.tag === "rock")!;
    expect(rock.likes).toBe(1);
    expect(rock.dislikes).toBe(1);
    expect(rock.total).toBe(2);

    const pop = result.find((t) => t.tag === "pop")!;
    expect(pop.likes).toBe(2);
    expect(pop.dislikes).toBe(0);
    expect(pop.likeRatio).toBe(1);
  });

  it("ignores rows with null tags", () => {
    const rows = [
      { rating: "thumbs_up", song: { tags: null } },
      { rating: "thumbs_up", song: { tags: "electronic" } },
    ];
    const result = computeTagBreakdown(rows);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("electronic");
  });

  it("respects the limit parameter", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      rating: "thumbs_up",
      song: { tags: `tag${i}` },
    }));
    expect(computeTagBreakdown(rows, 5)).toHaveLength(5);
  });
});

describe("computeComboBreakdown", () => {
  it("normalizes and sorts tag combos", () => {
    const rows = [
      { rating: "thumbs_up", song: { tags: "Pop, Rock" } },
      { rating: "thumbs_up", song: { tags: "rock, pop" } },
    ];
    const result = computeComboBreakdown(rows);
    expect(result).toHaveLength(1);
    expect(result[0].combo).toBe("pop, rock");
    expect(result[0].likes).toBe(2);
  });
});

describe("buildWeeklyTrend", () => {
  it("produces the specified number of weeks", () => {
    const result = buildWeeklyTrend([], new Date("2025-06-01"), 4);
    expect(result).toHaveLength(4);
  });

  it("fills zeros for missing weeks", () => {
    const result = buildWeeklyTrend([], new Date("2025-06-01"), 2);
    expect(result.every((w) => w.likes === 0 && w.dislikes === 0)).toBe(true);
  });

  it("matches raw rows to their Monday-aligned week", () => {
    const now = new Date("2025-06-02T12:00:00Z"); // Monday
    const rawRows = [
      { week: new Date("2025-06-02"), likes: BigInt(3), dislikes: BigInt(1) },
    ];
    const result = buildWeeklyTrend(rawRows, now, 1);
    expect(result[0].likes).toBe(3);
    expect(result[0].dislikes).toBe(1);
  });
});
