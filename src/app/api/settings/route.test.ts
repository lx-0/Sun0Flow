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
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "./route";

const seg = { params: Promise.resolve({}) };

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
});

describe("GET /api/settings", () => {
  it("returns user settings with connected providers", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      name: "Alice",
      bio: "bio",
      avatarUrl: null,
      emailWelcome: true,
      emailGenerationComplete: false,
      emailDigestFrequency: "weekly",
      quietHoursEnabled: true,
      quietHoursStart: 23,
      quietHoursEnd: 7,
      accounts: [
        { provider: "google", type: "oauth" },
        { provider: "github", type: "oauth" },
      ],
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/settings"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.connectedProviders).toEqual(["google", "github"]);
    expect(data.id).toBe("user-1");
    expect(data.email).toBe("a@example.com");
    expect(data.name).toBe("Alice");
    expect(data.emailDigestFrequency).toBe("weekly");
  });
});

describe("PATCH /api/settings", () => {
  it("returns validation error for empty payload", async () => {
    const res = await PATCH(makePatchRequest({}), seg);
    expect(res.status).toBe(400);
  });

  it("updates profile and email preference fields", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      name: "Alice",
      bio: null,
      avatarUrl: null,
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: "daily",
      quietHoursEnabled: false,
      quietHoursStart: 0,
      quietHoursEnd: 0,
    } as never);

    const res = await PATCH(
      makePatchRequest({ name: "<b>Alice</b>", emailDigestFrequency: "daily", quietHoursStart: 8 }),
      seg,
    );

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        name: "Alice",
        emailDigestFrequency: "daily",
        quietHoursStart: 8,
      }),
      select: expect.objectContaining({
        id: true,
        email: true,
        name: true,
        emailDigestFrequency: true,
        quietHoursStart: true,
      }),
    });
  });

  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await PATCH(makePatchRequest({ name: "Alice" }), seg);
    expect(res.status).toBe(401);
  });
});
