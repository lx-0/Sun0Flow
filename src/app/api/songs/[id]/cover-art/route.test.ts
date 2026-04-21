import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

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
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const SONG_ID = "song-abc";

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/songs/${SONG_ID}/cover-art`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: SONG_ID } as never);
  vi.mocked(prisma.song.update).mockResolvedValue({ id: SONG_ID, imageUrl: null } as never);
});

describe("PATCH /api/songs/[id]/cover-art", () => {
  it("returns 401 when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(makeRequest({ imageUrl: "https://example.com/img.png" }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when song not found", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null as never);
    const res = await PATCH(makeRequest({ imageUrl: "https://example.com/img.png" }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(404);
  });

  it("accepts an HTTPS URL", async () => {
    const imageUrl = "https://cdn.example.com/cover.jpg";
    vi.mocked(prisma.song.update).mockResolvedValue({ id: SONG_ID, imageUrl } as never);
    const res = await PATCH(makeRequest({ imageUrl }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.song.imageUrl).toBe(imageUrl);
  });

  it("accepts an SVG data URI", async () => {
    const imageUrl = "data:image/svg+xml;base64,PHN2Zyc+PC9zdmc+";
    vi.mocked(prisma.song.update).mockResolvedValue({ id: SONG_ID, imageUrl } as never);
    const res = await PATCH(makeRequest({ imageUrl }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(200);
  });

  it("accepts a PNG data URI (uploaded raster image)", async () => {
    const imageUrl = "data:image/png;base64,iVBORw0KGgoAAAANS";
    vi.mocked(prisma.song.update).mockResolvedValue({ id: SONG_ID, imageUrl } as never);
    const res = await PATCH(makeRequest({ imageUrl }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(200);
  });

  it("accepts a JPEG data URI (uploaded raster image)", async () => {
    const imageUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";
    vi.mocked(prisma.song.update).mockResolvedValue({ id: SONG_ID, imageUrl } as never);
    const res = await PATCH(makeRequest({ imageUrl }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(200);
  });

  it("rejects a non-HTTPS, non-data-URI value", async () => {
    const res = await PATCH(makeRequest({ imageUrl: "http://insecure.example.com/img.jpg" }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing imageUrl", async () => {
    const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(400);
  });

  it("rejects a data URI that is too large", async () => {
    const hugeUri = "data:image/png;base64," + "A".repeat(5_800_000);
    const res = await PATCH(makeRequest({ imageUrl: hugeUri }), { params: Promise.resolve({ id: SONG_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
