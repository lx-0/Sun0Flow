import { describe, it, expect } from "vitest";
import { normalizeTags, comboKey, tallyFeedback } from "./feedback-tally";

describe("normalizeTags", () => {
  it("splits, trims, and lowercases", () => {
    expect(normalizeTags("Rock, Pop,  jazz ")).toEqual(["rock", "pop", "jazz"]);
  });

  it("filters empty segments", () => {
    expect(normalizeTags(",rock,,")).toEqual(["rock"]);
  });
});

describe("comboKey", () => {
  it("returns sorted comma-joined tags", () => {
    expect(comboKey("Pop, Rock")).toBe("pop, rock");
    expect(comboKey("rock, pop")).toBe("pop, rock");
  });
});

describe("tallyFeedback", () => {
  it("counts likes and dislikes per extracted key", () => {
    const rows = [
      { rating: "thumbs_up", tags: "rock, pop" },
      { rating: "thumbs_down", tags: "rock, jazz" },
      { rating: "thumbs_up", tags: "pop" },
    ];
    const result = tallyFeedback(rows, normalizeTags);
    const rock = result.find((t) => t.key === "rock")!;
    expect(rock.likes).toBe(1);
    expect(rock.dislikes).toBe(1);
    expect(rock.total).toBe(2);

    const pop = result.find((t) => t.key === "pop")!;
    expect(pop.likes).toBe(2);
    expect(pop.likeRatio).toBe(1);
  });

  it("skips rows with null tags", () => {
    const rows = [
      { rating: "thumbs_up", tags: null },
      { rating: "thumbs_up", tags: "electronic" },
    ];
    const result = tallyFeedback(rows, normalizeTags);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("electronic");
  });

  it("respects limit option", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      rating: "thumbs_up",
      tags: `tag${i}`,
    }));
    expect(tallyFeedback(rows, normalizeTags, { limit: 5 })).toHaveLength(5);
  });

  it("filters by minTotal", () => {
    const rows = [
      { rating: "thumbs_up", tags: "rare" },
      { rating: "thumbs_up", tags: "common" },
      { rating: "thumbs_down", tags: "common" },
      { rating: "thumbs_up", tags: "common" },
    ];
    const result = tallyFeedback(rows, normalizeTags, { minTotal: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("common");
  });

  it("sorts by total by default", () => {
    const rows = [
      { rating: "thumbs_up", tags: "a" },
      { rating: "thumbs_up", tags: "b" },
      { rating: "thumbs_up", tags: "b" },
    ];
    const result = tallyFeedback(rows, normalizeTags);
    expect(result[0].key).toBe("b");
  });

  it("sorts by likeRatio when requested", () => {
    const rows = [
      { rating: "thumbs_up", tags: "loved" },
      { rating: "thumbs_up", tags: "mixed" },
      { rating: "thumbs_down", tags: "mixed" },
      { rating: "thumbs_down", tags: "mixed" },
    ];
    const result = tallyFeedback(rows, normalizeTags, { sortBy: "likeRatio" });
    expect(result[0].key).toBe("loved");
  });

  it("works with combo key extraction", () => {
    const rows = [
      { rating: "thumbs_up", tags: "Pop, Rock" },
      { rating: "thumbs_up", tags: "rock, pop" },
    ];
    const result = tallyFeedback(rows, (tags) => [comboKey(tags)]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("pop, rock");
    expect(result[0].likes).toBe(2);
  });
});
