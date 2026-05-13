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
  getSongById: vi.fn(),
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
      create: vi.fn(),
    },
  },
}));

import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey, getSongById } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("POST /api/suno/import", () => {
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

    const res = await POST(new NextRequest("http://localhost/api/suno/import", { method: "POST", body: JSON.stringify({ songIds: ["a"] }) }), seg);
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty songIds", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("api-key");

    const res = await POST(new NextRequest("http://localhost/api/suno/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: [] }),
    }), seg);

    expect(res.status).toBe(400);
  });

  it("imports missing songs and skips existing ones", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("api-key");
    vi.mocked(prisma.song.findMany).mockResolvedValue([{ sunoJobId: "s1", id: "local-1" }] as never);
    vi.mocked(getSongById).mockResolvedValue({
      id: "s2",
      title: "Song 2",
      audioUrl: "a2",
      imageUrl: null,
      duration: 120,
      tags: null,
      lyrics: null,
      prompt: null,
      model: "v4",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue({ id: "local-2" } as never);

    const res = await POST(new NextRequest("http://localhost/api/suno/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: ["s1", "s2"] }),
    }), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.skipped).toEqual([{ sunoId: "s1", reason: "already imported" }]);
    expect(data.imported).toEqual([{ sunoId: "s2", localId: "local-2" }]);
  });
});
