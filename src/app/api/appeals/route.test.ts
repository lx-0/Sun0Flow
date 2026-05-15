import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: { findUnique: vi.fn() },
    appeal: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn() },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/appeals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/appeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
  });

  it("creates an appeal when song is hidden and owned by user", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      userId: "user-1",
      isHidden: true,
      title: "Song",
    } as never);
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.appeal.create).mockResolvedValue({ id: "appeal-1" } as never);

    const res = await POST(makeRequest({ songId: "song-1", reason: "Please review this moderation decision." }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "appeal-1", status: "pending" });
  });

  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(makeRequest({ songId: "song-1", reason: "Please review this moderation decision." }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns validation error when reason is too short", async () => {
    const res = await POST(makeRequest({ songId: "song-1", reason: "too short" }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns duplicate appeal error when one already exists", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({
      id: "song-1",
      userId: "user-1",
      isHidden: true,
      title: "Song",
    } as never);
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({ id: "existing", status: "pending" } as never);

    const res = await POST(makeRequest({ songId: "song-1", reason: "Please review this moderation decision." }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("DUPLICATE_APPEAL");
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/appeals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ bad json",
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });
});
