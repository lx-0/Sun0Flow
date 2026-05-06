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

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
  releaseRateLimitSlot: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/sunoapi/resolve-key", () => ({
  resolveUserApiKey: vi.fn(),
  resolveUserApiKeyWithMode: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  recordCreditUsage: vi.fn().mockResolvedValue(undefined),
  getMonthlyCreditUsage: vi.fn().mockResolvedValue({ creditsRemaining: 100 }),
  CREDIT_COSTS: { generate: 1 },
  checkCredits: vi.fn().mockResolvedValue({ ok: true, creditCost: 1, creditsRemaining: 100 }),
  deductCredits: vi.fn().mockResolvedValue(undefined),
  getCreditCost: vi.fn().mockReturnValue(1),
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey, resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import {
  getMonthlyCreditUsage,
  recordCreditUsage,
  checkCredits,
  deductCredits,
} from "@/lib/credits";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DEFAULT_BODY = { prompt: "upbeat pop song", title: "Test", tags: "pop", makeInstrumental: false };

// ─── Setup ───────────────────────────────────────────────────────────────────

const DEFAULT_CREDIT_USAGE = {
  budget: 500,
  subscriptionBudget: 500,
  topUpCredits: 0,
  topUpCreditsRemaining: 0,
  subscriptionCreditsRemaining: 400,
  creditsUsedThisMonth: 100,
  creditsRemaining: 100,
  generationsThisMonth: 10,
  usagePercent: 20,
  isLow: false,
  totalCreditsAllTime: 100,
  totalGenerationsAllTime: 10,
  dailyChart: [] as never[],
};

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(acquireRateLimitSlot).mockResolvedValue({
    acquired: true,
    status: { remaining: 5, limit: 10, resetAt: new Date().toISOString() },
  });
  vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
  vi.mocked(resolveUserApiKeyWithMode).mockResolvedValue({ apiKey: undefined, usingPersonalKey: false });
  vi.mocked(getMonthlyCreditUsage).mockResolvedValue(DEFAULT_CREDIT_USAGE);
  vi.mocked(recordCreditUsage).mockResolvedValue(undefined as never);
  vi.mocked(checkCredits).mockResolvedValue({ ok: true, creditCost: 1, creditsRemaining: 100 });
  vi.mocked(deductCredits).mockResolvedValue(undefined);
  mockSunoApiKey = "test-key";
  vi.mocked(prisma.song.create).mockResolvedValue({ id: "song-1" } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockSunoApiKey = "test-key";
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/generate", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(acquireRateLimitSlot).mockResolvedValue({
      acquired: false,
      status: { remaining: 0, limit: 10, resetAt: new Date().toISOString() },
    });
    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain("Rate limit exceeded");
  });

  it("returns 400 for empty prompt", async () => {
    const res = await POST(makeRequest({ prompt: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt is required");
  });

  it("saves a failed record on Suno API 5xx error", async () => {
    const apiError = new SunoApiError(502, "Bad Gateway");
    vi.mocked(generateSong).mockRejectedValue(apiError);

    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.error).toContain("temporarily unavailable");
    expect(data.songs).toHaveLength(1);

    // Should have created a song with failed status
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
          errorMessage: expect.stringContaining("temporarily unavailable"),
        }),
      })
    );

    // Should log the error with context
    expect(logServerError).toHaveBeenCalledWith(
      "generate-api",
      apiError,
      expect.objectContaining({
        userId: "user-1",
        route: "/api/generate",
        params: expect.objectContaining({ prompt: "upbeat pop song" }),
      })
    );
  });

  it("saves a failed record on Suno API 4xx error", async () => {
    const apiError = new SunoApiError(400, "Invalid prompt");
    vi.mocked(generateSong).mockRejectedValue(apiError);

    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.error).toContain("Invalid parameters");

    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
        }),
      })
    );
  });

  it("saves a failed record on Suno API 429 (service busy)", async () => {
    const apiError = new SunoApiError(429, "Too many requests");
    vi.mocked(generateSong).mockRejectedValue(apiError);

    const res = await POST(makeRequest(DEFAULT_BODY));
    const data = await res.json();
    expect(data.error).toContain("busy");
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
        }),
      })
    );
  });

  it("saves a failed record on network/fetch error", async () => {
    const networkError = new TypeError("fetch failed");
    vi.mocked(generateSong).mockRejectedValue(networkError);

    const res = await POST(makeRequest(DEFAULT_BODY));
    const data = await res.json();
    expect(data.error).toContain("Could not reach");
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
        }),
      })
    );
  });

  it("uses mock songs when no API key is configured", async () => {
    mockSunoApiKey = undefined;
    vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);

    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(201);

    // Should NOT have called generateSong
    expect(generateSong).not.toHaveBeenCalled();

    // Should have created a ready mock song
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "ready",
        }),
      })
    );
  });

  it("creates a pending song on successful API call", async () => {
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });

    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.error).toBeUndefined();

    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "pending",
          sunoJobId: "task-xyz",
        }),
      })
    );
  });

  it("records credit usage after successful generation", async () => {
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });

    await POST(makeRequest(DEFAULT_BODY));

    expect(deductCredits).toHaveBeenCalledWith(
      "user-1",
      "generate",
      expect.objectContaining({
        songId: "song-1",
      })
    );
  });

  it("returns 402 when user has insufficient credits", async () => {
    vi.mocked(checkCredits).mockResolvedValue({ ok: false, creditCost: 1, creditsRemaining: 0 });

    const res = await POST(makeRequest(DEFAULT_BODY));
    expect(res.status).toBe(402);

    const data = await res.json();
    expect(data.code).toBe("INSUFFICIENT_CREDITS");
    expect(data.error).toContain("Insufficient credits");

    // Should not attempt generation
    expect(generateSong).not.toHaveBeenCalled();
    expect(prisma.song.create).not.toHaveBeenCalled();
  });

  it("does not record credit usage when credits are insufficient", async () => {
    vi.mocked(checkCredits).mockResolvedValue({ ok: false, creditCost: 1, creditsRemaining: 0 });

    await POST(makeRequest(DEFAULT_BODY));

    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("deducts credits after successful generation (notifications handled internally)", async () => {
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xyz" });

    await POST(makeRequest(DEFAULT_BODY));

    expect(deductCredits).toHaveBeenCalledWith(
      "user-1",
      "generate",
      expect.objectContaining({ songId: "song-1" })
    );
  });
});

describe("POST /api/generate — malformed input edge cases", () => {
  it("returns 500 when request body is malformed JSON", async () => {
    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json ::::",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("INTERNAL_ERROR");
    // Internal error details must not leak to the client
    expect(data.error).not.toContain("SyntaxError");
  });

  it("returns 500 when request body is empty (no JSON)", async () => {
    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("sanitizes XSS payload in prompt and proceeds with generation", async () => {
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xss" });

    const xssPrompt = '<script>alert("xss")</script>pop upbeat music';
    const res = await POST(makeRequest({ ...DEFAULT_BODY, prompt: xssPrompt }));

    // Route should NOT reject the request; it strips HTML and continues
    expect(res.status).toBe(201);
    // The song should be created with the stripped prompt
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: expect.not.stringContaining("<script>"),
        }),
      })
    );
  });

  it("sanitizes XSS payload in title and proceeds with generation", async () => {
    vi.mocked(generateSong).mockResolvedValue({ taskId: "task-xss-title" });

    const res = await POST(
      makeRequest({ ...DEFAULT_BODY, title: '<img src=x onerror=alert(1)>My Song' })
    );

    expect(res.status).toBe(201);
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: expect.not.stringContaining("<img"),
        }),
      })
    );
  });

  it("rejects an explicitly empty prompt regardless of HTML content", async () => {
    // The route validates prompt before stripping — empty string is rejected
    const res = await POST(makeRequest({ ...DEFAULT_BODY, prompt: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });
});
