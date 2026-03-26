/**
 * Integration tests for MCP resource providers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return ""; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: { findFirst: vi.fn() },
    playlist: { findFirst: vi.fn() },
    pendingFeedGeneration: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/credits", () => ({
  getMonthlyCreditUsage: vi.fn(),
  CREDIT_COSTS: { generate: 10, extend: 10, cover: 10, mashup: 10, lyrics: 2, style_boost: 5 },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getMonthlyCreditUsage } from "@/lib/credits";
import {
  _resetResourceRegistry,
  getStaticResources,
  getTemplateResources,
  resolveResource,
} from "./resources";

// Load providers (side-effects register them)
import "./providers/songs";
import "./providers/playlists";
import "./providers/feed";
import "./providers/credits";

const USER_ID = "user-test-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Registry ──────────────────────────────────────────────────────────────────

describe("resource registry", () => {
  it("has static resources registered", () => {
    const uris = getStaticResources().map((r) => r.uri);
    expect(uris).toContain("sunoflow://feed/inspiration");
    expect(uris).toContain("sunoflow://stats/credits");
  });

  it("has template resources registered", () => {
    const uriTemplates = getTemplateResources().map((t) => t.uriTemplate);
    expect(uriTemplates).toContain("sunoflow://songs/{id}");
    expect(uriTemplates).toContain("sunoflow://playlists/{id}");
  });
});

// ── songs resource ────────────────────────────────────────────────────────────

describe("sunoflow://songs/{id}", () => {
  it("resolves a song by URI", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({
      id: "song-1",
      title: "Test Song",
      prompt: "happy pop",
      tags: "pop",
      audioUrl: "https://cdn.suno.ai/audio.mp3",
      imageUrl: null,
      duration: 180,
      lyrics: "La la la",
      generationStatus: "ready",
      isInstrumental: false,
      sunoModel: null,
      rating: null,
      playCount: 5,
      createdAt: new Date("2026-03-01"),
    } as never);

    const result = await resolveResource("sunoflow://songs/song-1", USER_ID);

    expect(result).not.toBeNull();
    expect(result!.uri).toBe("sunoflow://songs/song-1");
    expect(result!.mimeType).toBe("application/json");
    const data = JSON.parse(result!.text);
    expect(data.id).toBe("song-1");
    expect(data.audioUrl).toBe("https://cdn.suno.ai/audio.mp3");
    expect(data.lyrics).toBe("La la la");
  });

  it("throws when song not found", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null);

    await expect(
      resolveResource("sunoflow://songs/missing", USER_ID)
    ).rejects.toThrow("Song not found");
  });

  it("returns null for non-matching URI", async () => {
    const result = await resolveResource("sunoflow://unknown/path", USER_ID);
    expect(result).toBeNull();
  });

  it("template: match returns params for valid URI", () => {
    const songTemplate = getTemplateResources().find(
      (t) => t.uriTemplate === "sunoflow://songs/{id}"
    );
    expect(songTemplate).toBeDefined();
    expect(songTemplate!.match("sunoflow://songs/abc-123")).toEqual({ id: "abc-123" });
  });

  it("template: match returns null for unrelated URI", () => {
    const songTemplate = getTemplateResources().find(
      (t) => t.uriTemplate === "sunoflow://songs/{id}"
    );
    expect(songTemplate!.match("sunoflow://playlists/123")).toBeNull();
    expect(songTemplate!.match("sunoflow://songs/")).toBeNull();
  });
});

// ── playlists resource ────────────────────────────────────────────────────────

describe("sunoflow://playlists/{id}", () => {
  it("resolves a playlist with tracks", async () => {
    vi.mocked(prisma.playlist.findFirst).mockResolvedValue({
      id: "pl-1",
      name: "My Playlist",
      description: "A test playlist",
      isPublic: false,
      createdAt: new Date("2026-03-01"),
      updatedAt: new Date("2026-03-01"),
      songs: [
        {
          position: 0,
          addedAt: new Date("2026-03-01"),
          song: {
            id: "song-1",
            title: "Track One",
            tags: "pop",
            audioUrl: "https://cdn.suno.ai/t1.mp3",
            duration: 180,
            generationStatus: "ready",
          },
        },
      ],
      _count: { songs: 1 },
    } as never);

    const result = await resolveResource("sunoflow://playlists/pl-1", USER_ID);

    expect(result).not.toBeNull();
    const data = JSON.parse(result!.text);
    expect(data.name).toBe("My Playlist");
    expect(data.trackCount).toBe(1);
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].id).toBe("song-1");
    expect(data.tracks[0].position).toBe(0);
  });

  it("throws when playlist not found", async () => {
    vi.mocked(prisma.playlist.findFirst).mockResolvedValue(null);

    await expect(
      resolveResource("sunoflow://playlists/bad-id", USER_ID)
    ).rejects.toThrow("Playlist not found");
  });
});

// ── feed/inspiration resource ─────────────────────────────────────────────────

describe("sunoflow://feed/inspiration", () => {
  it("returns pending feed items", async () => {
    vi.mocked(prisma.pendingFeedGeneration.findMany).mockResolvedValue([
      {
        id: "fi-1",
        feedTitle: "Tech Blog",
        itemTitle: "AI Music Revolution",
        itemLink: "https://example.com/1",
        itemPubDate: "2026-03-01",
        prompt: "electronic music about AI",
        style: "electronic",
        createdAt: new Date("2026-03-01"),
      },
    ] as never);

    const result = await resolveResource("sunoflow://feed/inspiration", USER_ID);

    expect(result).not.toBeNull();
    expect(result!.uri).toBe("sunoflow://feed/inspiration");
    const data = JSON.parse(result!.text);
    expect(data.total).toBe(1);
    expect(data.items[0].itemTitle).toBe("AI Music Revolution");
  });

  it("returns empty list when feed is empty", async () => {
    vi.mocked(prisma.pendingFeedGeneration.findMany).mockResolvedValue([] as never);

    const result = await resolveResource("sunoflow://feed/inspiration", USER_ID);
    expect(result).not.toBeNull();
    const data = JSON.parse(result!.text);
    expect(data.total).toBe(0);
    expect(data.items).toHaveLength(0);
  });
});

// ── stats/credits resource ────────────────────────────────────────────────────

describe("sunoflow://stats/credits", () => {
  it("returns credit stats", async () => {
    vi.mocked(getMonthlyCreditUsage).mockResolvedValue({
      creditsRemaining: 300,
      budget: 500,
      creditsUsedThisMonth: 200,
      usagePercent: 40,
      generationsThisMonth: 20,
      isLow: false,
      totalCreditsAllTime: 1200,
      totalGenerationsAllTime: 120,
      dailyChart: [],
    });

    const result = await resolveResource("sunoflow://stats/credits", USER_ID);

    expect(result).not.toBeNull();
    expect(result!.uri).toBe("sunoflow://stats/credits");
    const data = JSON.parse(result!.text);
    expect(data.creditsRemaining).toBe(300);
    expect(data.budget).toBe(500);
    expect(data.isLow).toBe(false);
    expect(data.costs.generate).toBe(10);
  });
});

// ── resolveResource null cases ────────────────────────────────────────────────

describe("resolveResource", () => {
  it("returns null for completely unknown URIs", async () => {
    expect(await resolveResource("sunoflow://unknown/resource", USER_ID)).toBeNull();
  });

  it("returns null for non-sunoflow URIs", async () => {
    expect(await resolveResource("https://example.com/resource", USER_ID)).toBeNull();
  });
});

// ── Registry reset (last — clears all registrations) ─────────────────────────

describe("resource registry reset", () => {
  it("_resetResourceRegistry clears all registrations", () => {
    _resetResourceRegistry();
    expect(getStaticResources()).toHaveLength(0);
    expect(getTemplateResources()).toHaveLength(0);
  });
});
