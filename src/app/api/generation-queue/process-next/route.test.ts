import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockSunoApiKey: string | undefined = "test-key";
vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return mockSunoApiKey; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generationQueueItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    song: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sunoapi", () => ({
  generateSong: vi.fn(),
  SunoApiError: class SunoApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "SunoApiError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/sunoapi/mock", () => ({
  mockSongs: [
    {
      title: "Mock Song",
      tags: "pop",
      audioUrl: "https://example.com/mock.mp3",
      imageUrl: null,
      duration: 120,
      lyrics: "la la la",
      model: "V5",
    },
  ],
}));

vi.mock("@/lib/rate-limit", () => ({
  acquireRateLimitSlot: vi.fn(),
}));

vi.mock("@/lib/sunoapi/resolve-key", () => ({
  resolveUserApiKey: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  recordCreditUsage: vi.fn().mockResolvedValue(undefined),
  shouldNotifyLowCredits: vi.fn().mockResolvedValue(false),
  createLowCreditNotification: vi.fn().mockResolvedValue(undefined),
  getMonthlyCreditUsage: vi.fn().mockResolvedValue({ creditsRemaining: 100, budget: 500 }),
  CREDIT_COSTS: { generate: 1 },
  checkCredits: vi.fn().mockResolvedValue({ ok: true, creditCost: 1, creditsRemaining: 100 }),
  deductCredits: vi.fn().mockResolvedValue(undefined),
  getCreditCost: vi.fn().mockReturnValue(1),
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { recordCreditUsage, deductCredits } from "@/lib/credits";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/generation-queue/process-next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

const baseQueueItem = {
  id: "item-1",
  userId: "user-1",
  prompt: "upbeat pop song",
  title: "Test Song",
  tags: "pop",
  makeInstrumental: false,
  personaId: null,
  position: 0,
  status: "pending",
  songId: null,
  errorMessage: null,
};

const baseSong = {
  id: "song-1",
  userId: "user-1",
  sunoJobId: "task-xyz",
  title: "Test Song",
  prompt: "upbeat pop song",
  tags: "pop",
  generationStatus: "pending",
  isInstrumental: false,
  errorMessage: null,
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSunoApiKey = "test-key";
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(acquireRateLimitSlot).mockResolvedValue({
    acquired: true,
    status: { remaining: 5, limit: 10, resetAt: new Date().toISOString() },
  });
  vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
  vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.generationQueueItem.update).mockResolvedValue({} as never);
  vi.mocked(prisma.song.create).mockResolvedValue({ ...baseSong } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockSunoApiKey = "test-key";
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/generation-queue/process-next", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 'Already processing' when an item is already in processing state", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce({ ...baseQueueItem, status: "processing" } as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Already processing");
    expect(generateSong).not.toHaveBeenCalled();
  });

  it("returns 'Queue empty' when no pending items exist", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)  // no processing item
      .mockResolvedValueOnce(null); // no pending item

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Queue empty");
    expect(data.item).toBeNull();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null) // no processing
      .mockResolvedValueOnce({ ...baseQueueItem } as never); // next pending item
    vi.mocked(acquireRateLimitSlot).mockResolvedValue({
      acquired: false,
      status: { remaining: 0, limit: 10, resetAt: new Date().toISOString() },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(generateSong).not.toHaveBeenCalled();
  });

  it("uses mock mode when no API key is configured", async () => {
    mockSunoApiKey = undefined;
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseQueueItem } as never);
    vi.mocked(prisma.song.create).mockResolvedValue({
      ...baseSong,
      generationStatus: "ready",
      audioUrl: "https://example.com/mock.mp3",
    } as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    expect(generateSong).not.toHaveBeenCalled();
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generationStatus: "ready" }),
      })
    );
  });

  it("creates a pending song and links queue item on successful API call", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseQueueItem } as never);
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);

    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sunoJobId: "task-xyz",
          generationStatus: "pending",
        }),
      })
    );

    expect(prisma.generationQueueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ songId: "song-1", status: "processing" }),
      })
    );
  });

  it("records credit usage after successful generation", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseQueueItem } as never);
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });

    await POST(makeRequest());

    expect(deductCredits).toHaveBeenCalledWith(
      "user-1",
      "generate",
      expect.objectContaining({ songId: "song-1" })
    );
  });

  it("saves a failed song and updates queue item on API error", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseQueueItem } as never);
    const apiError = new SunoApiError(502, "Bad Gateway");
    vi.mocked(generateSong).mockRejectedValue(apiError);
    vi.mocked(prisma.song.create).mockResolvedValue({
      ...baseSong,
      generationStatus: "failed",
      errorMessage: "temporarily unavailable",
    } as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.error).toContain("temporarily unavailable");
    expect(data.song.generationStatus).toBe("failed");

    expect(prisma.generationQueueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      })
    );
    expect(logServerError).toHaveBeenCalledWith("queue-process", apiError, expect.any(Object));
  });

  it("marks processing item as done (ready) in mock mode", async () => {
    mockSunoApiKey = undefined;
    vi.mocked(prisma.generationQueueItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseQueueItem } as never);
    vi.mocked(prisma.song.create).mockResolvedValue({
      ...baseSong,
      generationStatus: "ready",
    } as never);

    await POST(makeRequest());

    expect(prisma.generationQueueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "done" }),
      })
    );
  });

  it("returns 500 on unexpected internal error", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockRejectedValue(new Error("DB error"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(logServerError).toHaveBeenCalled();
  });
});
