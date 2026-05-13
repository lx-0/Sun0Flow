import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, PATCH } from "./route";

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

const seg = { params: Promise.resolve({}) };

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/profile/email-preferences", {
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

describe("GET /api/profile/email-preferences", () => {
  it("returns preference fields", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      emailWelcome: true,
      emailGenerationComplete: false,
      emailDigestFrequency: "weekly",
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/profile/email-preferences"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.emailDigestFrequency).toBe("weekly");
    expect(data.quietHoursStart).toBe(22);
  });
});

describe("PATCH /api/profile/email-preferences", () => {
  it("returns validation error for empty payload", async () => {
    const res = await PATCH(makePatchRequest({}), seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("adds unsubscribe token when missing and updates fields", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ unsubscribeToken: null } as never)
      .mockResolvedValueOnce({
        emailWelcome: true,
        emailGenerationComplete: true,
        emailDigestFrequency: "daily",
        quietHoursEnabled: false,
        quietHoursStart: 0,
        quietHoursEnd: 0,
      } as never);

    vi.mocked(prisma.user.update).mockResolvedValue({
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: "daily",
      quietHoursEnabled: false,
      quietHoursStart: 0,
      quietHoursEnd: 0,
    } as never);

    const res = await PATCH(
      makePatchRequest({ emailWelcome: true, emailDigestFrequency: "daily" }),
      seg,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        emailWelcome: true,
        emailDigestFrequency: "daily",
        unsubscribeToken: expect.any(String),
      }),
      select: {
        emailWelcome: true,
        emailGenerationComplete: true,
        emailDigestFrequency: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    expect(res.status).toBe(200);
  });

  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await PATCH(makePatchRequest({ emailWelcome: true }), seg);
    expect(res.status).toBe(401);
  });
});
