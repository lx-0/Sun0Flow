import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  acquireRateLimitSlot: vi.fn(),
  releaseRateLimitSlot: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/sunoapi", () => ({
  uploadFileBase64: vi.fn(),
  uploadFileFromUrl: vi.fn(),
  uploadAndCover: vi.fn(),
  uploadAndExtend: vi.fn(),
  generateSong: vi.fn(),
  resolveUserApiKey: vi.fn(),
  SunoApiError: class SunoApiError extends Error {
    status: number;
    details?: Record<string, unknown>;
    constructor(status: number, message: string) {
      super(message);
      this.name = "SunoApiError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    generationQueueItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  checkCredits: vi.fn().mockResolvedValue({ ok: true, creditCost: 1, creditsRemaining: 100 }),
  deductCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/metrics", () => ({
  recordGenerationStart: vi.fn(),
  recordGenerationEnd: vi.fn(),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  CircuitOpenError: class CircuitOpenError extends Error {},
  onCircuitClose: vi.fn(),
}));

vi.mock("@/lib/generation-queue", () => ({
  enqueueFromSpec: vi.fn().mockResolvedValue(undefined),
  updateItem: vi.fn().mockResolvedValue(undefined),
  resolveBySongId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cover-art-generator", () => ({
  generateCoverArtVariants: vi.fn().mockReturnValue([]),
}));

import { resolveUser } from "@/lib/auth";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import {
  uploadFileBase64,
  uploadFileFromUrl,
  uploadAndCover,
  uploadAndExtend,
  SunoApiError,
} from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const seg = { params: Promise.resolve({}) } as never;

const RATE_LIMIT_STATUS = { remaining: 5, limit: 10, resetAt: new Date(Date.now() + 60000).toISOString() };

const COVER_BODY = {
  mode: "cover",
  base64Data: "SGVsbG8gV29ybGQ=", // tiny valid base64
  title: "Cover Song",
  prompt: "upbeat cover",
};

const EXTEND_BODY = {
  mode: "extend",
  base64Data: "SGVsbG8gV29ybGQ=",
  title: "Extended Song",
  continueAt: 30,
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(acquireRateLimitSlot).mockResolvedValue({ acquired: true, status: RATE_LIMIT_STATUS });
  vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
  process.env.SUNOAPI_KEY = "test-key";
  vi.mocked(uploadFileBase64).mockResolvedValue({ fileId: "file-1", fileUrl: "https://cdn.example.com/upload.mp3", downloadUrl: "https://cdn.example.com/upload.mp3", expiresAt: "2099-01-01T00:00:00Z" });
  vi.mocked(uploadFileFromUrl).mockResolvedValue({ fileId: "file-2", fileUrl: "https://cdn.example.com/upload.mp3", downloadUrl: "https://cdn.example.com/upload.mp3", expiresAt: "2099-01-01T00:00:00Z" });
  vi.mocked(uploadAndCover).mockResolvedValue({ taskId: "task-cover-1" });
  vi.mocked(uploadAndExtend).mockResolvedValue({ taskId: "task-extend-1" });
  vi.mocked(prisma.song.create).mockResolvedValue({ id: "song-1" } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/upload — authentication", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /api/upload — rate limiting", () => {
  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(acquireRateLimitSlot).mockResolvedValue({
      acquired: false,
      status: { remaining: 0, limit: 10, resetAt: new Date(Date.now() + 30000).toISOString() },
    });

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.code).toBe("RATE_LIMIT");
    expect(data.error).toContain("Rate limit exceeded");
  });
});

describe("POST /api/upload — input validation", () => {
  it("returns 400 when mode is invalid", async () => {
    const res = await POST(makeRequest({ ...COVER_BODY, mode: "invalid" }) as never, seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("cover");
  });

  it("returns 400 when neither base64Data nor fileUrl is provided", async () => {
    const res = await POST(makeRequest({ mode: "cover", title: "My Song" }) as never, seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("required");
  });

  it("returns 400 when both base64Data and fileUrl are provided", async () => {
    const res = await POST(makeRequest({
      mode: "cover",
      base64Data: "SGVsbG8=",
      fileUrl: "https://example.com/song.mp3",
    }) as never, seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("not both");
  });

  it("returns 400 when base64Data exceeds 10MB limit", async () => {
    const tenMbPlusOneDecoded = 10 * 1024 * 1024 + 1;
    const base64Length = Math.ceil(tenMbPlusOneDecoded / 3) * 4;
    const oversizedBase64 = "A".repeat(base64Length);

    const res = await POST(makeRequest({ mode: "cover", base64Data: oversizedBase64 }) as never, seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("10MB");
  });

  it("returns 400 when no API key is configured", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);
    delete process.env.SUNOAPI_KEY;

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("API key");
  });
});

describe("POST /api/upload — successful uploads", () => {
  it("creates a pending song on successful cover upload from base64", async () => {
    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(201);

    expect(uploadFileBase64).toHaveBeenCalled();
    expect(uploadAndCover).toHaveBeenCalled();
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          generationStatus: "pending",
          sunoJobId: "task-cover-1",
        }),
      })
    );
  });

  it("creates a pending song on successful extend upload", async () => {
    const res = await POST(makeRequest(EXTEND_BODY) as never, seg);
    expect(res.status).toBe(201);

    expect(uploadAndExtend).toHaveBeenCalled();
    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "pending",
          sunoJobId: "task-extend-1",
        }),
      })
    );
  });

  it("uploads from URL when fileUrl is provided", async () => {
    const res = await POST(makeRequest({
      mode: "cover",
      fileUrl: "https://example.com/song.mp3",
    }) as never, seg);
    expect(res.status).toBe(201);
    expect(uploadFileFromUrl).toHaveBeenCalled();
    expect(uploadFileBase64).not.toHaveBeenCalled();
  });

  it("response includes rateLimit status", async () => {
    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    const data = await res.json();
    expect(data).toHaveProperty("rateLimit");
    expect(data.rateLimit).toHaveProperty("limit");
    expect(data.rateLimit).toHaveProperty("remaining");
  });
});

describe("POST /api/upload — API error handling", () => {
  it("creates a failed song record and returns 201 on Suno API 5xx error", async () => {
    const apiError = new SunoApiError(503, "Service Unavailable");
    vi.mocked(uploadFileBase64).mockRejectedValue(apiError);

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.error).toContain("temporarily unavailable");

    expect(prisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "failed",
        }),
      })
    );
  });

  it("creates a failed song record on Suno API 429 (service busy)", async () => {
    const apiError = new SunoApiError(429, "Too many requests");
    vi.mocked(uploadFileBase64).mockRejectedValue(apiError);

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.error).toContain("busy");
  });

  it("creates a failed song record on Suno API 400 (bad parameters)", async () => {
    const apiError = new SunoApiError(400, "Invalid parameters");
    vi.mocked(uploadFileBase64).mockRejectedValue(apiError);

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.error).toContain("Invalid parameters");
  });

  it("creates a failed song record on network error", async () => {
    vi.mocked(uploadFileBase64).mockRejectedValue(new TypeError("fetch failed"));

    const res = await POST(makeRequest(COVER_BODY) as never, seg);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.error).toContain("Could not reach");
  });

  it("logs errors via logServerError on API failure", async () => {
    const apiError = new SunoApiError(502, "Bad Gateway");
    vi.mocked(uploadFileBase64).mockRejectedValue(apiError);

    await POST(makeRequest(COVER_BODY) as never, seg);
    expect(logServerError).toHaveBeenCalledWith(
      "upload-api",
      apiError,
      expect.objectContaining({ userId: "user-1", route: "/api/upload" })
    );
  });

  it("returns 500 with INTERNAL_ERROR code on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json ::::",
    });

    const res = await POST(req as never, seg);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("INTERNAL_ERROR");
    expect(data.error).not.toContain("SyntaxError");
  });

  it("returns consistent error format (error + code) on 500", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    const res = await POST(req as never, seg);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data).toHaveProperty("code");
    expect(typeof data.error).toBe("string");
    expect(typeof data.code).toBe("string");
  });
});
