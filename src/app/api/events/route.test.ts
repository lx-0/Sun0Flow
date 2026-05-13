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

vi.mock("@/lib/event-bus", () => ({
  subscribe: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { subscribe } from "@/lib/event-bus";
import { GET } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("GET /api/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
    vi.mocked(subscribe).mockReturnValue(() => {});
  });

  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/events"), seg);
    expect(res.status).toBe(401);
  });

  it("returns an SSE stream for authenticated users", async () => {
    const res = await GET(new NextRequest("http://localhost/api/events"), seg);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(subscribe).toHaveBeenCalledWith("user-1", expect.any(Function));
  });
});
