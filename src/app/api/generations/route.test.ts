import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const seg = { params: Promise.resolve({}) };

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/generations");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

const baseSong = {
  id: "song-1",
  title: "Test Song",
  prompt: "upbeat pop",
  tags: "pop",
  audioUrl: "https://example.com/audio.mp3",
  imageUrl: null,
  duration: 120,
  generationStatus: "ready",
  errorMessage: null,
  isInstrumental: false,
  source: null,
  createdAt: new Date("2026-03-27T00:00:00Z"),
  updatedAt: new Date("2026-03-27T00:00:00Z"),
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.song.findMany).mockResolvedValue([{ ...baseSong }] as never);
  vi.mocked(prisma.song.count).mockResolvedValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/generations", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(401);
  });

  it("returns songs with pagination metadata", async () => {
    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.songs).toHaveLength(1);
    expect(data.songs[0].id).toBe("song-1");
    expect(data.total).toBe(1);
    expect(data.nextCursor).toBeNull();
  });

  it("filters by status when status param is provided", async () => {
    await GET(makeRequest({ status: "pending" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ generationStatus: "pending" }),
      })
    );
  });

  it("does not filter by status when status is 'all'", async () => {
    await GET(makeRequest({ status: "all" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ generationStatus: expect.anything() }),
      })
    );
  });

  it("filters by source when source param is provided", async () => {
    await GET(makeRequest({ source: "upload" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "upload" }),
      })
    );
  });

  it("searches by prompt when q param has 2+ characters", async () => {
    await GET(makeRequest({ q: "pop" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          prompt: { contains: "pop", mode: "insensitive" },
        }),
      })
    );
  });

  it("does not apply search filter when q has fewer than 2 characters", async () => {
    await GET(makeRequest({ q: "p" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ prompt: expect.anything() }),
      })
    );
  });

  it("sorts by oldest when sortBy=oldest", async () => {
    await GET(makeRequest({ sortBy: "oldest" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("sorts by newest by default", async () => {
    await GET(makeRequest(), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("applies cursor-based pagination when cursor param is set", async () => {
    const cursor = "2026-03-26T00:00:00.000Z";
    await GET(makeRequest({ cursor }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ lt: new Date(cursor) }),
        }),
      })
    );
  });

  it("returns nextCursor when there are more results", async () => {
    // Return PAGE_SIZE + 1 songs to indicate there are more
    const songs = Array.from({ length: 21 }, (_, i) => ({
      ...baseSong,
      id: `song-${i + 1}`,
      createdAt: new Date(`2026-03-${String(27 - i).padStart(2, "0")}T00:00:00Z`),
      updatedAt: new Date(`2026-03-${String(27 - i).padStart(2, "0")}T00:00:00Z`),
    }));
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs as never);
    vi.mocked(prisma.song.count).mockResolvedValue(25);

    const res = await GET(makeRequest(), seg);
    const data = await res.json();

    expect(data.songs).toHaveLength(20); // PAGE_SIZE = 20
    expect(data.nextCursor).not.toBeNull();
  });

  it("filters by dateFrom and dateTo when provided", async () => {
    await GET(makeRequest({ dateFrom: "2026-03-01", dateTo: "2026-03-27" }), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date("2026-03-01"),
          }),
        }),
      })
    );
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(prisma.song.findMany).mockRejectedValue(new Error("DB crash"));

    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(500);
    expect(logServerError).toHaveBeenCalled();
  });

  it("scopes results to current user only", async () => {
    await GET(makeRequest(), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
      })
    );
  });
});
