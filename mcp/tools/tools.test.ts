/**
 * Integration tests for MCP tool handlers.
 * Verifies tool registration and handler execution against mocked Prisma and libs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return ""; }, // empty → demo mode for generate_song
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    playlist: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    playlistSong: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/credits", () => ({
  getMonthlyCreditUsage: vi.fn(),
  recordCreditUsage: vi.fn(),
  CREDIT_COSTS: { generate: 10, extend: 10, cover: 10, mashup: 10, lyrics: 2, style_boost: 5 },
  checkCredits: vi.fn(),
  deductCredits: vi.fn(),
  getCreditCost: vi.fn((action: string) => {
    const costs: Record<string, number> = { generate: 10, extend: 10, cover: 10, mashup: 10, lyrics: 2, style_boost: 5 };
    return costs[action] ?? 10;
  }),
}));

vi.mock("@/lib/sunoapi", () => ({
  generateSong: vi.fn(),
  SunoApiError: class SunoApiError extends Error {},
}));

vi.mock("@/lib/sunoapi/resolve-key", () => ({
  resolveUserApiKeyWithMode: vi.fn(),
}));

vi.mock("@/lib/sanitize", () => ({
  stripHtml: (s: string) => s,
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getMonthlyCreditUsage, recordCreditUsage, checkCredits, deductCredits } from "@/lib/credits";
import { generateSong } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { getTool } from "../registry";

// Load tools (side-effects register them)
import "./generate_song";
import "./list_songs";
import "./get_song";
import "./playlist";
import "./get_credits";

const USER_ID = "user-test-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── generate_song ─────────────────────────────────────────────────────────────

describe("generate_song tool", () => {
  it("is registered", () => {
    expect(getTool("generate_song")).toBeDefined();
  });

  it("throws when prompt is missing", async () => {
    const tool = getTool("generate_song")!;
    await expect(tool.handler({ prompt: "" }, USER_ID)).rejects.toThrow("prompt is required");
  });

  it("creates a song in demo mode (no api key) and returns songId + status", async () => {
    vi.mocked(resolveUserApiKeyWithMode).mockResolvedValue({
      apiKey: undefined,
      usingPersonalKey: false,
    });
    vi.mocked(checkCredits).mockResolvedValue({ ok: true, creditCost: 10, creditsRemaining: 100 });
    vi.mocked(prisma.song.create).mockResolvedValue({
      id: "song-abc",
      generationStatus: "ready",
      title: "Test Song",
    } as never);

    const tool = getTool("generate_song")!;
    const result = await tool.handler(
      { prompt: "happy pop", genre: "pop", mood: "happy", title: "Test Song" },
      USER_ID
    ) as { songId: string; generationStatus: string };

    expect(result.songId).toBe("song-abc");
    expect(result.generationStatus).toBe("ready");
    // In demo mode (no API key), generateSong is not called
    expect(generateSong).not.toHaveBeenCalled();
  });

  it("calls generateSong when API key is available and deducts credits", async () => {
    vi.mocked(resolveUserApiKeyWithMode).mockResolvedValue({
      apiKey: "sk-test",
      usingPersonalKey: false,
    });
    vi.mocked(checkCredits).mockResolvedValue({ ok: true, creditCost: 10, creditsRemaining: 100 });
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });
    vi.mocked(prisma.song.create).mockResolvedValue({
      id: "song-def",
      generationStatus: "pending",
      title: null,
    } as never);
    vi.mocked(deductCredits).mockResolvedValue(undefined);

    const tool = getTool("generate_song")!;
    const result = await tool.handler({ prompt: "chill lo-fi" }, USER_ID) as {
      songId: string;
      generationStatus: string;
    };

    expect(generateSong).toHaveBeenCalledWith("chill lo-fi", { title: undefined, style: undefined }, "sk-test");
    expect(result.songId).toBe("song-def");
    expect(result.generationStatus).toBe("pending");
    expect(deductCredits).toHaveBeenCalledWith(USER_ID, "generate", expect.objectContaining({ songId: "song-def" }));
  });

  it("throws insufficient credits error when balance is low", async () => {
    vi.mocked(resolveUserApiKeyWithMode).mockResolvedValue({
      apiKey: "sk-test",
      usingPersonalKey: false,
    });
    vi.mocked(checkCredits).mockResolvedValue({ ok: false, creditCost: 10, creditsRemaining: 5 });

    const tool = getTool("generate_song")!;
    await expect(tool.handler({ prompt: "rock ballad" }, USER_ID)).rejects.toThrow(
      "Insufficient credits"
    );
  });
});

// ── list_songs ────────────────────────────────────────────────────────────────

describe("list_songs tool", () => {
  it("is registered", () => {
    expect(getTool("list_songs")).toBeDefined();
  });

  it("returns songs and pagination info", async () => {
    const mockSongs = [
      { id: "s1", title: "Song One", generationStatus: "ready", createdAt: new Date() },
      { id: "s2", title: "Song Two", generationStatus: "ready", createdAt: new Date() },
    ];
    vi.mocked(prisma.song.findMany).mockResolvedValue(mockSongs as never);
    vi.mocked(prisma.song.count).mockResolvedValue(2);

    const tool = getTool("list_songs")!;
    const result = await tool.handler({ limit: 5 }, USER_ID) as {
      songs: typeof mockSongs;
      nextCursor: string | null;
      total: number;
    };

    expect(result.songs).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.nextCursor).toBeNull();
  });

  it("sets nextCursor when there are more results", async () => {
    // Return limit+1 songs to indicate hasMore
    const mockSongs = Array.from({ length: 3 }, (_, i) => ({
      id: `song-${i}`,
      title: `Song ${i}`,
      generationStatus: "ready",
      createdAt: new Date(),
    }));
    vi.mocked(prisma.song.findMany).mockResolvedValue(mockSongs as never);
    vi.mocked(prisma.song.count).mockResolvedValue(10);

    const tool = getTool("list_songs")!;
    const result = await tool.handler({ limit: 2 }, USER_ID) as {
      songs: unknown[];
      nextCursor: string | null;
    };

    expect(result.songs).toHaveLength(2);
    expect(result.nextCursor).toBe("song-1");
  });
});

// ── get_song ──────────────────────────────────────────────────────────────────

describe("get_song tool", () => {
  it("is registered", () => {
    expect(getTool("get_song")).toBeDefined();
  });

  it("returns song when found", async () => {
    const mockSong = {
      id: "song-xyz",
      title: "My Song",
      generationStatus: "ready",
      audioUrl: "https://cdn.suno.ai/audio.mp3",
    };
    vi.mocked(prisma.song.findFirst).mockResolvedValue(mockSong as never);

    const tool = getTool("get_song")!;
    const result = await tool.handler({ songId: "song-xyz" }, USER_ID) as {
      song: typeof mockSong;
    };

    expect(result.song.id).toBe("song-xyz");
    expect(result.song.audioUrl).toBe("https://cdn.suno.ai/audio.mp3");
  });

  it("throws when song not found", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null);

    const tool = getTool("get_song")!;
    await expect(tool.handler({ songId: "missing" }, USER_ID)).rejects.toThrow("Song not found");
  });

  it("throws when songId is missing", async () => {
    const tool = getTool("get_song")!;
    await expect(tool.handler({}, USER_ID)).rejects.toThrow("songId is required");
  });
});

// ── create_playlist ───────────────────────────────────────────────────────────

describe("create_playlist tool", () => {
  it("is registered", () => {
    expect(getTool("create_playlist")).toBeDefined();
  });

  it("creates a playlist and returns it", async () => {
    vi.mocked(prisma.playlist.count).mockResolvedValue(0);
    vi.mocked(prisma.playlist.create).mockResolvedValue({
      id: "pl-1",
      name: "My Playlist",
      description: null,
      createdAt: new Date(),
    } as never);

    const tool = getTool("create_playlist")!;
    const result = await tool.handler({ name: "My Playlist" }, USER_ID) as {
      playlist: { id: string; name: string };
    };

    expect(result.playlist.id).toBe("pl-1");
    expect(result.playlist.name).toBe("My Playlist");
  });

  it("throws when name is empty", async () => {
    const tool = getTool("create_playlist")!;
    await expect(tool.handler({ name: "" }, USER_ID)).rejects.toThrow("name is required");
  });

  it("throws when playlist limit is reached", async () => {
    vi.mocked(prisma.playlist.count).mockResolvedValue(50);

    const tool = getTool("create_playlist")!;
    await expect(tool.handler({ name: "Overflow" }, USER_ID)).rejects.toThrow(
      "Maximum of 50 playlists reached"
    );
  });
});

// ── add_to_playlist ───────────────────────────────────────────────────────────

describe("add_to_playlist tool", () => {
  it("is registered", () => {
    expect(getTool("add_to_playlist")).toBeDefined();
  });

  it("adds a song to a playlist", async () => {
    vi.mocked(prisma.playlist.findFirst).mockResolvedValue({
      id: "pl-1",
      userId: USER_ID,
      _count: { songs: 3 },
    } as never);
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1", userId: USER_ID } as never);
    vi.mocked(prisma.playlistSong.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.playlistSong.findFirst).mockResolvedValue({ position: 2 } as never);
    vi.mocked(prisma.playlistSong.create).mockResolvedValue({} as never);

    const tool = getTool("add_to_playlist")!;
    const result = await tool.handler(
      { playlistId: "pl-1", songId: "song-1" },
      USER_ID
    ) as { added: boolean; position: number };

    expect(result.added).toBe(true);
    expect(result.position).toBe(3);
  });

  it("returns alreadyInPlaylist when song is already in the playlist", async () => {
    vi.mocked(prisma.playlist.findFirst).mockResolvedValue({
      id: "pl-1",
      userId: USER_ID,
      _count: { songs: 1 },
    } as never);
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);
    vi.mocked(prisma.playlistSong.findUnique).mockResolvedValue({ id: "ps-1" } as never);

    const tool = getTool("add_to_playlist")!;
    const result = await tool.handler(
      { playlistId: "pl-1", songId: "song-1" },
      USER_ID
    ) as { alreadyInPlaylist: boolean };

    expect(result.alreadyInPlaylist).toBe(true);
    expect(prisma.playlistSong.create).not.toHaveBeenCalled();
  });

  it("throws when playlist not found", async () => {
    vi.mocked(prisma.playlist.findFirst).mockResolvedValue(null);

    const tool = getTool("add_to_playlist")!;
    await expect(
      tool.handler({ playlistId: "bad-id", songId: "song-1" }, USER_ID)
    ).rejects.toThrow("Playlist not found");
  });
});

// ── get_credits ───────────────────────────────────────────────────────────────

describe("get_credits tool", () => {
  it("is registered", () => {
    expect(getTool("get_credits")).toBeDefined();
  });

  it("returns credit balance", async () => {
    vi.mocked(getMonthlyCreditUsage).mockResolvedValue({
      creditsRemaining: 250,
      budget: 500,
      subscriptionBudget: 500,
      topUpCredits: 0,
      topUpCreditsRemaining: 0,
      subscriptionCreditsRemaining: 250,
      creditsUsedThisMonth: 250,
      usagePercent: 50,
      generationsThisMonth: 25,
      isLow: false,
      totalCreditsAllTime: 1000,
      totalGenerationsAllTime: 100,
      dailyChart: [],
    });

    const tool = getTool("get_credits")!;
    const result = await tool.handler({}, USER_ID) as {
      creditsRemaining: number;
      budget: number;
      costPerGeneration: number;
    };

    expect(result.creditsRemaining).toBe(250);
    expect(result.budget).toBe(500);
    expect(result.costPerGeneration).toBe(10);
  });
});
