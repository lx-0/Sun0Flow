import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const SONG_ID = "song-gen-1";

function makeRequest() {
  return new Request(`http://localhost/api/songs/${SONG_ID}/cover-art/generate`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: SONG_ID, title: "My Rock Song", tags: "rock" } as never);
});

describe("POST /api/songs/[id]/cover-art/generate", () => {
  it("returns 401 when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when song not found", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null as never);
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 3 variants with SVG data URIs", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(3);
    for (const v of body.variants) {
      expect(v.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(v.label).toBeTruthy();
      expect(v.style).toBeTruthy();
    }
  });

  it("returns deterministic variants for the same song", async () => {
    const res1 = await POST(makeRequest(), { params: Promise.resolve({ id: SONG_ID }) });
    const res2 = await POST(makeRequest(), { params: Promise.resolve({ id: SONG_ID }) });
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.variants[0].dataUrl).toBe(body2.variants[0].dataUrl);
  });
});
