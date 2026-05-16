import { describe, expect, it } from "vitest";
import {
  buildFeedGenerationPatchData,
  ensurePendingFeedGeneration,
} from "@/lib/feed-generations";

describe("ensurePendingFeedGeneration", () => {
  it("returns null for pending items", () => {
    expect(ensurePendingFeedGeneration({ status: "pending" }, "updated")).toBeNull();
  });

  it("returns conflict response for non-pending items", async () => {
    const res = ensurePendingFeedGeneration({ status: "approved" }, "approved");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(409);
    await expect(res?.json()).resolves.toMatchObject({
      error: "Only pending items can be approved",
      code: "CONFLICT",
    });
  });
});

describe("buildFeedGenerationPatchData", () => {
  it("includes only supported updates", () => {
    expect(
      buildFeedGenerationPatchData({
        status: "dismissed",
        prompt: "  hello world  ",
        style: "electronic",
      }),
    ).toEqual({
      status: "dismissed",
      prompt: "hello world",
      style: "electronic",
    });
  });

  it("ignores empty prompt and unsupported status", () => {
    expect(
      buildFeedGenerationPatchData({
        status: "pending",
        prompt: "   ",
      }),
    ).toEqual({});
  });
});
