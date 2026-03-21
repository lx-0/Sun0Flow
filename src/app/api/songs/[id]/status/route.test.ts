import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sunoapi", () => ({
  getTaskStatus: vi.fn(),
}));

vi.mock("@/lib/sunoapi/resolve-key", () => ({
  resolveUserApiKey: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/songs/song-1/status");
}

function makeParams() {
  return { params: Promise.resolve({ id: "song-1" }) };
}

const baseSong = {
  id: "song-1",
  userId: "user-1",
  sunoJobId: "task-abc",
  title: "Test Song",
  prompt: "upbeat pop",
  tags: "pop",
  generationStatus: "pending",
  pollCount: 0,
  audioUrl: null,
  imageUrl: null,
  duration: null,
  lyrics: null,
  sunoModel: null,
  isInstrumental: false,
  errorMessage: null,
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
  process.env.SUNOAPI_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUNOAPI_KEY;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/songs/[id]/status", () => {
  it("marks song as failed when poll count exceeds max (timeout)", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      ...baseSong,
      pollCount: 20, // At max
    } as never);
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      generationStatus: "failed",
      errorMessage: "Generation timed out",
      pollCount: 21,
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
    expect(data.song.errorMessage).toBe("Generation timed out");
    expect(prisma.song.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
          errorMessage: "Generation timed out",
        }),
      })
    );
  });

  it("marks song as failed on Suno API task failure (GENERATE_AUDIO_FAILED)", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    vi.mocked(getTaskStatus).mockResolvedValue({
      taskId: "task-abc",
      status: "GENERATE_AUDIO_FAILED",
      songs: [],
      errorMessage: "Audio generation failed due to content policy",
    });
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      generationStatus: "failed",
      errorMessage: "Audio generation failed due to content policy",
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
    expect(data.song.errorMessage).toContain("content policy");
  });

  it("marks song as failed on SENSITIVE_WORD_ERROR", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    vi.mocked(getTaskStatus).mockResolvedValue({
      taskId: "task-abc",
      status: "SENSITIVE_WORD_ERROR",
      songs: [],
      errorMessage: "Prompt contains sensitive content",
    });
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      generationStatus: "failed",
      errorMessage: "Prompt contains sensitive content",
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
  });

  it("increments poll count on transient API error and logs it", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    const transientError = new Error("Connection reset");
    vi.mocked(getTaskStatus).mockRejectedValue(transientError);
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      pollCount: 1,
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    // Should NOT mark as failed — just increment poll count
    expect(data.song.pollCount).toBe(1);
    expect(data.song.generationStatus).toBe("pending");

    // Should log the error with context
    expect(logServerError).toHaveBeenCalledWith(
      "status-poll",
      transientError,
      expect.objectContaining({
        userId: "user-1",
        params: expect.objectContaining({ songId: "song-1", sunoJobId: "task-abc" }),
      })
    );
  });

  it("marks song as failed when no sunoJobId exists", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      ...baseSong,
      sunoJobId: null,
    } as never);
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      sunoJobId: null,
      generationStatus: "failed",
      errorMessage: "No Suno task ID",
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
    expect(data.song.errorMessage).toBe("No Suno task ID");
  });

  it("returns existing song when already in terminal state (ready)", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      ...baseSong,
      generationStatus: "ready",
      audioUrl: "https://example.com/song.mp3",
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("ready");
    // Should NOT call getTaskStatus or update
    expect(getTaskStatus).not.toHaveBeenCalled();
    expect(prisma.song.update).not.toHaveBeenCalled();
  });

  it("updates song to ready when task succeeds", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    vi.mocked(getTaskStatus).mockResolvedValue({
      taskId: "task-abc",
      status: "SUCCESS",
      songs: [
        {
          id: "suno-1",
          title: "Generated Song",
          prompt: "upbeat pop",
          audioUrl: "https://cdn.suno.com/audio.mp3",
          imageUrl: "https://cdn.suno.com/img.jpg",
          duration: 180,
          status: "complete",
          model: "V4",
          lyrics: "la la la",
          createdAt: "2026-03-21T00:00:00Z",
        },
      ],
      errorMessage: null,
    });
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      generationStatus: "ready",
      audioUrl: "https://cdn.suno.com/audio.mp3",
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("ready");
  });
});
