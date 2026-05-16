import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  get WEBHOOK_BASE_URL() { return "http://localhost:3000"; },
  get SUNO_WEBHOOK_SECRET() { return "test-webhook-secret"; },
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  resolveUser: vi.fn().mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    generationQueueItem: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendGenerationCompleteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sunoapi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sunoapi")>("@/lib/sunoapi");
  return {
    ...actual,
    resolveUserApiKey: vi.fn(),
  };
});

vi.mock("@/lib/generation/completion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation/completion")>("@/lib/generation/completion");
  return {
    ...actual,
    pollOnce: vi.fn(),
  };
});

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/event-bus", () => ({
  broadcast: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/generation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation")>("@/lib/generation");
  return {
    ...actual,
    handleSongSuccess: vi.fn().mockResolvedValue(undefined),
    handleSongFailure: vi.fn().mockResolvedValue(undefined),
  };
});

import { auth, resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { pollOnce } from "@/lib/generation/completion";
import { handleSongSuccess, handleSongFailure } from "@/lib/generation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/songs/song-1/status");
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
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
  vi.mocked(prisma.generationQueueItem.updateMany).mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/songs/[id]/status", () => {
  it("delegates to handleSongFailure when poll count exceeds max (timeout)", async () => {
    vi.mocked(prisma.song.findUnique)
      .mockResolvedValueOnce({ ...baseSong, pollCount: 60 } as never)
      .mockResolvedValueOnce({
        ...baseSong,
        generationStatus: "failed",
        errorMessage: "Generation timed out",
        pollCount: 61,
      } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
    expect(data.song.errorMessage).toBe("Generation timed out");
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Generation timed out",
    );
  });

  it("delegates to handleSongFailure on terminal poll outcome", async () => {
    vi.mocked(prisma.song.findUnique)
      .mockResolvedValueOnce({ ...baseSong } as never)
      .mockResolvedValueOnce({
        ...baseSong,
        generationStatus: "failed",
        errorMessage: "Audio generation failed due to content policy",
      } as never);
    vi.mocked(pollOnce).mockResolvedValue({
      kind: "failed",
      errorMessage: "Audio generation failed due to content policy",
    });

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
    expect(data.song.errorMessage).toContain("content policy");
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Audio generation failed due to content policy",
    );
  });

  it("delegates to handleSongFailure on SENSITIVE_WORD_ERROR outcome", async () => {
    vi.mocked(prisma.song.findUnique)
      .mockResolvedValueOnce({ ...baseSong } as never)
      .mockResolvedValueOnce({
        ...baseSong,
        generationStatus: "failed",
        errorMessage: "Prompt contains sensitive content",
      } as never);
    vi.mocked(pollOnce).mockResolvedValue({
      kind: "failed",
      errorMessage: "Prompt contains sensitive content",
    });

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("failed");
  });

  it("increments poll count on poll_error and logs it", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    const transientError = new Error("Connection reset");
    vi.mocked(pollOnce).mockResolvedValue({ kind: "poll_error", error: transientError });
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      pollCount: 1,
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.pollCount).toBe(1);
    expect(data.song.generationStatus).toBe("pending");

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
    const pendingRow = { ...baseSong, sunoJobId: null };
    const failedRow = {
      ...baseSong,
      sunoJobId: null,
      generationStatus: "failed",
      errorMessage: "No Suno task ID",
    };
    // The route fetches the song, lifecycle.markSongFailedSimple re-reads
    // archivedAt, then the route re-reads the updated row. Sequence the
    // mocks so the final read returns the failed state.
    vi.mocked(prisma.song.findUnique)
      .mockResolvedValueOnce(pendingRow as never)
      .mockResolvedValueOnce({ archivedAt: null } as never)
      .mockResolvedValueOnce(failedRow as never);
    vi.mocked(prisma.song.update).mockResolvedValue(failedRow as never);

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
    expect(pollOnce).not.toHaveBeenCalled();
    expect(prisma.song.update).not.toHaveBeenCalled();
  });

  it("delegates to handleSongSuccess on ready outcome", async () => {
    const songs = [
      {
        id: "suno-1",
        title: "Generated Song",
        prompt: "upbeat pop",
        audioUrl: "https://cdn.suno.com/audio.mp3",
        imageUrl: "https://cdn.suno.com/img.jpg",
        duration: 180,
        status: "complete" as const,
        model: "V5",
        lyrics: "la la la",
        createdAt: "2026-03-21T00:00:00Z",
      },
    ];
    vi.mocked(prisma.song.findUnique)
      .mockResolvedValueOnce({ ...baseSong } as never)
      .mockResolvedValueOnce({
        ...baseSong,
        generationStatus: "ready",
        audioUrl: "https://cdn.suno.com/audio.mp3",
      } as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "ready", songs });

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.generationStatus).toBe("ready");
    expect(handleSongSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      songs,
    );
  });

  it("increments poll count on processing outcome", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ ...baseSong } as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "processing" });
    vi.mocked(prisma.song.update).mockResolvedValue({
      ...baseSong,
      pollCount: 1,
    } as never);

    const res = await GET(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.song.pollCount).toBe(1);
    expect(prisma.song.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pollCount: 1 },
      })
    );
  });
});
