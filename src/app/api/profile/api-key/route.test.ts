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
  return new NextRequest("http://localhost/api/profile/api-key", {
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

describe("GET /api/profile/api-key", () => {
  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/profile/api-key"), seg);
    expect(res.status).toBe(401);
  });

  it("returns masked key metadata", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      sunoApiKey: "test",
      usePersonalApiKey: true,
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/profile/api-key"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      hasKey: true,
      maskedKey: "test…test",
      usePersonalApiKey: true,
    });
  });
});

describe("PATCH /api/profile/api-key", () => {
  it("returns validation error when no fields are provided", async () => {
    const res = await PATCH(makePatchRequest({}), seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("updates key and preference fields", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      sunoApiKey: "test",
      usePersonalApiKey: false,
    } as never);

    const res = await PATCH(
      makePatchRequest({ sunoApiKey: "  test  ", usePersonalApiKey: false }),
      seg,
    );
    const data = await res.json();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { sunoApiKey: "test", usePersonalApiKey: false },
      select: { sunoApiKey: true, usePersonalApiKey: true },
    });
    expect(res.status).toBe(200);
    expect(data.maskedKey).toBe("test…test");
  });
});
