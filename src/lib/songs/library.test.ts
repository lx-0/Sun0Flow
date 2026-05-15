import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/sunoapi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sunoapi")>("@/lib/sunoapi");
  return { ...actual, resolveUserApiKey: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/generation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation")>("@/lib/generation");
  return {
    ...actual,
    pollOnce: vi.fn(),
    handleSongSuccess: vi.fn().mockResolvedValue(undefined),
    handleSongFailure: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/error-logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { pollOnce, handleSongSuccess, handleSongFailure } from "@/lib/generation";
import { logServerError } from "@/lib/error-logger";
import { runStalePendingRecovery } from "./library";

function makeStaleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "song-1",
    userId: "user-1",
    sunoJobId: "task-abc",
    pollCount: 3,
    createdAt: new Date(Date.now() - 20 * 60 * 1000),
    prompt: "p",
    tags: "t",
    audioUrl: null,
    audioUrlExpiresAt: null,
    imageUrl: null,
    imageUrlExpiresAt: null,
    duration: null,
    lyrics: null,
    title: "Test",
    sunoModel: null,
    isInstrumental: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runStalePendingRecovery", () => {
  it("is a no-op when no stale rows", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([] as never);
    await runStalePendingRecovery("user-1");
    expect(pollOnce).not.toHaveBeenCalled();
    expect(handleSongFailure).not.toHaveBeenCalled();
  });

  it("recovers via handleSongSuccess when upstream is ready", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow()] as never);
    vi.mocked(pollOnce).mockResolvedValue({
      kind: "ready",
      songs: [{ id: "x", title: "y", prompt: "p", audioUrl: "https://example.com/a.mp3", status: "complete", createdAt: "2026-05-15T00:00:00Z" }],
    });
    await runStalePendingRecovery("user-1");
    expect(handleSongSuccess).toHaveBeenCalledTimes(1);
    expect(handleSongFailure).not.toHaveBeenCalled();
  });

  it("attributes real upstream failure reason via handleSongFailure", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow()] as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "failed", errorMessage: "Content policy violation" });
    await runStalePendingRecovery("user-1");
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Content policy violation",
    );
    expect(handleSongSuccess).not.toHaveBeenCalled();
  });

  it("defers (bumps pollCount, no fail) when upstream is still processing under hard ceiling", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow({
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    })] as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "processing" });
    await runStalePendingRecovery("user-1");
    expect(handleSongFailure).not.toHaveBeenCalled();
    expect(prisma.song.update).toHaveBeenCalledWith({
      where: { id: "song-1" },
      data: { pollCount: 4 },
    });
  });

  it("hard-fails when upstream still processing past 60min ceiling", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow({
      createdAt: new Date(Date.now() - 65 * 60 * 1000),
    })] as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "processing" });
    await runStalePendingRecovery("user-1");
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Generation timed out (upstream still processing)",
    );
  });

  it("only marks timed-out when upstream is truly unreachable (poll_error)", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow()] as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "poll_error", error: new Error("404") });
    await runStalePendingRecovery("user-1");
    expect(logServerError).toHaveBeenCalledWith(
      "song-stale-poll-error",
      expect.any(Error),
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Generation timed out (upstream lost)",
    );
  });

  it("isolates per-row failures — one bad row does not block subsequent rows", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      makeStaleRow({ id: "song-bad" }),
      makeStaleRow({ id: "song-good" }),
    ] as never);
    vi.mocked(pollOnce).mockResolvedValue({ kind: "ready", songs: [
      { id: "x", title: "y", prompt: "p", audioUrl: "https://example.com/a.mp3", status: "complete", createdAt: "2026-05-15T00:00:00Z" },
    ] });
    vi.mocked(handleSongSuccess)
      .mockRejectedValueOnce(new Error("DB exploded"))
      .mockResolvedValueOnce({ persisted: true, sideEffectErrors: [] });

    await runStalePendingRecovery("user-1");

    expect(handleSongSuccess).toHaveBeenCalledTimes(2);
    expect(logServerError).toHaveBeenCalledWith(
      "song-stale-recover-error",
      expect.any(Error),
      expect.objectContaining({ params: expect.objectContaining({ songId: "song-bad" }) }),
    );
  });

  it("fails immediately when no sunoJobId present", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makeStaleRow({ sunoJobId: null })] as never);
    await runStalePendingRecovery("user-1");
    expect(pollOnce).not.toHaveBeenCalled();
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-1" }),
      "Generation timed out (no Suno task ID)",
    );
  });
});
