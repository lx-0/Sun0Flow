import { describe, expect, it } from "vitest";

import { getPromptValidationError, getRateLimitMeta, reorderPendingQueueIds } from "./helpers";

describe("getPromptValidationError", () => {
  it("requires lyrics in custom mode", () => {
    expect(getPromptValidationError("", true)).toBe("Lyrics are required");
  });

  it("requires style prompt in style mode", () => {
    expect(getPromptValidationError("", false)).toBe("Style / genre is required");
  });

  it("enforces max prompt length", () => {
    expect(getPromptValidationError("x".repeat(3001), false)).toBe("Prompt must be 3000 characters or less");
  });

  it("passes valid prompt", () => {
    expect(getPromptValidationError("indie pop", false)).toBeNull();
  });
});

describe("reorderPendingQueueIds", () => {
  it("moves an item up", () => {
    expect(reorderPendingQueueIds(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("moves an item down", () => {
    expect(reorderPendingQueueIds(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("keeps order when move is out of bounds", () => {
    expect(reorderPendingQueueIds(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
    expect(reorderPendingQueueIds(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });
});

describe("getRateLimitMeta", () => {
  it("returns green state when usage is low", () => {
    const rateLimit = {
      remaining: 8,
      limit: 10,
      resetAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    };

    expect(getRateLimitMeta(rateLimit)).toMatchObject({
      used: 2,
      pct: 20,
      barColor: "bg-green-500",
      isAtLimit: false,
      isNearLimit: false,
    });
  });

  it("returns yellow state when near limit", () => {
    const rateLimit = {
      remaining: 1,
      limit: 5,
      resetAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };

    expect(getRateLimitMeta(rateLimit)).toMatchObject({
      used: 4,
      pct: 80,
      barColor: "bg-yellow-500",
      isAtLimit: false,
      isNearLimit: true,
    });
  });

  it("returns red state at limit", () => {
    const rateLimit = {
      remaining: 0,
      limit: 10,
      resetAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    };

    expect(getRateLimitMeta(rateLimit)).toMatchObject({
      used: 10,
      pct: 100,
      barColor: "bg-red-500",
      minsLeft: 0,
      isAtLimit: true,
      isNearLimit: false,
    });
  });
});
