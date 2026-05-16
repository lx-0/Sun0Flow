import { describe, expect, it } from "vitest";
import { recordPlayRequestSchema } from "@/lib/analytics-data/request";
import { recordHistoryRequestSchema } from "@/lib/history/request";
import { mashupRequestSchema } from "@/lib/mashup/request";
import { createNotificationRequestSchema } from "@/lib/notifications/request";
import {
  recommendationsQuerySchema,
  similarRecommendationsQuerySchema,
} from "@/lib/recommendations/request";
import { publicSongsQuerySchema, songsQuerySchema } from "@/lib/songs/request";

describe("request schemas", () => {
  it("validates analytics play payloads", () => {
    expect(
      recordPlayRequestSchema.parse({ songId: "song-1", durationSec: 42 }),
    ).toEqual({ songId: "song-1", durationSec: 42 });
    expect(() => recordPlayRequestSchema.parse({ songId: "" })).toThrow();
  });

  it("validates history payloads", () => {
    expect(recordHistoryRequestSchema.parse({ songId: "song-1" })).toEqual({
      songId: "song-1",
    });
    expect(() => recordHistoryRequestSchema.parse({ songId: "" })).toThrow();
  });

  it("validates mashup payloads", () => {
    expect(
      mashupRequestSchema.parse({
        trackA: { songId: "a" },
        trackB: { fileUrl: "https://example.com/track.mp3" },
      }),
    ).toMatchObject({
      trackA: { songId: "a" },
      trackB: { fileUrl: "https://example.com/track.mp3" },
    });
    expect(() =>
      mashupRequestSchema.parse({
        trackA: {},
        trackB: { songId: "b" },
      }),
    ).toThrow();
  });

  it("validates notification payloads", () => {
    expect(
      createNotificationRequestSchema.parse({
        type: "generation_complete",
        title: "Ready",
        message: "Your song is ready",
      }),
    ).toMatchObject({
      type: "generation_complete",
      title: "Ready",
      message: "Your song is ready",
    });
    expect(() =>
      createNotificationRequestSchema.parse({
        type: "unknown",
        title: "x",
        message: "y",
      }),
    ).toThrow();
  });

  it("normalizes recommendations query params", () => {
    expect(recommendationsQuerySchema.parse({ limit: "999", exclude: "a,b" })).toEqual({
      limit: 50,
      exclude: ["a", "b"],
    });
    expect(similarRecommendationsQuerySchema.parse({ songId: "song-1", limit: "2" })).toEqual({
      songId: "song-1",
      limit: 2,
    });
    expect(() => similarRecommendationsQuerySchema.parse({ songId: "" })).toThrow();
  });

  it("normalizes songs query params", () => {
    expect(
      songsQuerySchema.parse({
        q: "  hi  ",
        tagId: "tag-1",
        includeVariations: "true",
        archived: "false",
      }),
    ).toMatchObject({
      search: "hi",
      tagIds: ["tag-1"],
      includeVariations: true,
      archived: false,
    });

    expect(
      publicSongsQuerySchema.parse({
        q: " query ",
        sort: "invalid",
        limit: "15",
        offset: "2",
      }),
    ).toEqual({
      q: "query",
      genre: undefined,
      mood: undefined,
      sort: "newest",
      limit: 15,
      offset: 2,
    });
  });
});
