import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

const mockResolveUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  resolveUser: (...args: unknown[]) => mockResolveUser(...args),
}));

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { POST, DELETE } from "./route";

const seg = { params: Promise.resolve({}) };
const USER_ID = "user-123";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init as never);
}

describe("/api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("POST returns 401 when unauthorized", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await POST(makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/e", keys: { p256dh: "k", auth: "a" } }),
    }), seg);

    expect(res.status).toBe(401);
  });

  it("POST returns 400 for invalid payload", async () => {
    const res = await POST(makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "", keys: { auth: "a" } }),
    }), seg);

    expect(res.status).toBe(400);
  });

  it("POST upserts subscription and returns 201", async () => {
    mockUpsert.mockResolvedValue({});

    const res = await POST(makeRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/e", keys: { p256dh: "k", auth: "a" } }),
    }), seg);

    expect(res.status).toBe(201);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { endpoint: "https://example.com/e" },
      update: { userId: USER_ID, p256dh: "k", auth: "a" },
      create: { userId: USER_ID, endpoint: "https://example.com/e", p256dh: "k", auth: "a" },
    });
  });

  it("DELETE removes subscription for user", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const res = await DELETE(makeRequest("http://localhost/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://example.com/e" }),
    }), seg);

    expect(res.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, endpoint: "https://example.com/e" },
    });
  });
});
