import { describe, expect, it } from "vitest";
import { buildGenerationWhere } from "./generation-history";

describe("buildGenerationWhere", () => {
  it("includes user scope and omits optional filters by default", () => {
    expect(buildGenerationWhere("user-1", {})).toEqual({ userId: "user-1" });
  });

  it("applies status and source filters when provided", () => {
    expect(
      buildGenerationWhere("user-1", {
        status: "pending",
        source: "upload",
      }),
    ).toEqual({
      userId: "user-1",
      generationStatus: "pending",
      source: "upload",
    });
  });

  it("ignores status/source when set to all", () => {
    expect(
      buildGenerationWhere("user-1", {
        status: "all",
        source: "all",
      }),
    ).toEqual({ userId: "user-1" });
  });

  it("ignores invalid date and cursor values", () => {
    expect(
      buildGenerationWhere("user-1", {
        dateFrom: "not-a-date",
        dateTo: "still-bad",
        cursor: "bad",
      }),
    ).toEqual({ userId: "user-1" });
  });
});
