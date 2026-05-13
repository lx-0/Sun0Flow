import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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

vi.mock("@/lib/sunoapi", () => ({
  resolveUserApiKey: vi.fn(),
  listSongs: vi.fn(),
  SunoApiError: class SunoApiError extends Error {
    status: number;
    constructor(status: number, message = "Suno API error") {
      super(message);
      this.status = status;
      this.name = "SunoApiError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
    },
  },
}));

import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey, listSongs } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("GET /api/suno/songs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/suno/songs"), seg);
    expect(res.status).toBe(401);
  });

  it("returns paginated songs and imported flags", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("api-key");
    vi.mocked(listSongs).mockResolvedValue([
      { id: "s1", title: "One", audioUrl: "a1", createdAt: "2026-01-01", status: "complete" },
      { id: "s2", title: "Two", audioUrl: "a2", createdAt: "2026-01-02", status: "complete" },
    ] as never);
    vi.mocked(prisma.song.findMany).mockResolvedValue([{ sunoJobId: "s2" }] as never);

    const res = await GET(new NextRequest("http://localhost/api/suno/songs?page=1&limit=1"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pagination).toEqual({ page: 1, limit: 1, total: 2, hasMore: true });
    expect(data.songs).toHaveLength(1);
    expect(data.songs[0].id).toBe("s1");
    expect(data.songs[0].alreadyImported).toBe(false);
  });
});
