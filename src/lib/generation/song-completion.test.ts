import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-bus", () => ({ broadcast: vi.fn() }));
vi.mock("@/lib/error-logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
  audioCache: { has: vi.fn().mockReturnValue(true), downloadAndPut: vi.fn() },
  imageCache: { has: vi.fn().mockReturnValue(true), downloadAndPut: vi.fn() },
}));
vi.mock("@/lib/notifications", () => ({
  notifyFollowersOfNewSong: vi.fn().mockResolvedValue(undefined),
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/streaks", () => ({
  recordDailyActivity: vi.fn().mockResolvedValue(1),
  checkSongMilestones: vi.fn().mockResolvedValue(undefined),
  checkStreakMilestones: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/generation-queue", () => ({ resolveBySongId: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "@/lib/prisma";
import { handleSongSuccess, handleSongFailure, type SongRecord } from "./song-completion";

const baseRecord: SongRecord = {
  id: "song-1",
  userId: "user-1",
  prompt: "p",
  tags: "t",
  audioUrl: null,
  audioUrlExpiresAt: null,
  imageUrl: null,
  imageUrlExpiresAt: null,
  duration: null,
  lyrics: null,
  title: "Title",
  sunoModel: null,
  isInstrumental: false,
  pollCount: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.song.update).mockResolvedValue({
    id: "song-1",
    title: "Title",
    audioUrl: "https://example.com/a.mp3",
    imageUrl: null,
  } as never);
  vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: null } as never);
});

describe("handleSongSuccess persistence", () => {
  it("clears archivedAt and errorMessage so a recovered song reappears in the library", async () => {
    await handleSongSuccess(baseRecord, [
      { audioUrl: "https://example.com/a.mp3", title: "Title" },
    ]);
    expect(prisma.song.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "song-1" },
        data: expect.objectContaining({
          generationStatus: "ready",
          archivedAt: null,
          errorMessage: null,
        }),
      }),
    );
  });

  it("does nothing when no completion songs are returned", async () => {
    const result = await handleSongSuccess(baseRecord, []);
    expect(result.persisted).toBe(false);
    expect(prisma.song.update).not.toHaveBeenCalled();
  });
});

describe("handleSongFailure auto-archive", () => {
  it("auto-archives a freshly-failed song so it doesn't pollute the library", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: null } as never);
    await handleSongFailure(baseRecord, "Generation timed out");
    expect(prisma.song.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "song-1" },
        data: expect.objectContaining({
          generationStatus: "failed",
          errorMessage: "Generation timed out",
        }),
      }),
    );
    const call = vi.mocked(prisma.song.update).mock.calls[0][0];
    expect((call.data as { archivedAt: Date }).archivedAt).toBeInstanceOf(Date);
  });

  it("preserves a user-set archivedAt rather than overwriting it", async () => {
    const userSet = new Date("2026-01-01T00:00:00Z");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: userSet } as never);
    await handleSongFailure(baseRecord, "Generation timed out");
    const call = vi.mocked(prisma.song.update).mock.calls[0][0];
    expect((call.data as { archivedAt: Date }).archivedAt).toBe(userSet);
  });
});
