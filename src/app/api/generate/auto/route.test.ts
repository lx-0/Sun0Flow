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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  acquireRateLimitSlot: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/llm";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { POST } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("POST /api/generate/auto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
    vi.mocked(acquireRateLimitSlot).mockResolvedValue({
      acquired: true,
      status: { limit: 10, resetAt: new Date(Date.now() + 60_000).toISOString() },
    } as never);
    vi.mocked(prisma.song.findMany).mockResolvedValue([] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await POST(new NextRequest("http://localhost/api/generate/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    }), seg);

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing prompt", async () => {
    const res = await POST(new NextRequest("http://localhost/api/generate/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), seg);

    expect(res.status).toBe(400);
  });

  it("returns generated title/style/lyricsPrompt", async () => {
    vi.mocked(generateText).mockResolvedValue('{"title":"Neon Tide","style":"synthwave pop","lyricsPrompt":"A late-night drive."}');

    const res = await POST(new NextRequest("http://localhost/api/generate/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "late night city drive" }),
    }), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      title: "Neon Tide",
      style: "synthwave pop",
      lyricsPrompt: "A late-night drive.",
    });
  });
});
