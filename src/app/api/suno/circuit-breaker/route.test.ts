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

vi.mock("@/lib/circuit-breaker", () => ({
  getCircuitStatus: vi.fn(),
  resetCircuit: vi.fn(),
}));

import { resolveUser, requireAdmin } from "@/lib/auth";
import { getCircuitStatus, resetCircuit } from "@/lib/circuit-breaker";
import { GET, POST } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("/api/suno/circuit-breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin-1" },
      error: null,
    } as never);
    vi.mocked(getCircuitStatus).mockReturnValue({ state: "closed", failures: 0 } as never);
  });

  it("GET returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/suno/circuit-breaker"), seg);
    expect(res.status).toBe(401);
  });

  it("GET returns current circuit state", async () => {
    const res = await GET(new NextRequest("http://localhost/api/suno/circuit-breaker"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ state: "closed", failures: 0 });
  });

  it("POST returns 403 when non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) as never,
    } as never);

    const res = await POST(new NextRequest("http://localhost/api/suno/circuit-breaker", { method: "POST" }), seg);
    expect(res.status).toBe(403);
  });

  it("POST resets and returns updated status for admin", async () => {
    vi.mocked(getCircuitStatus).mockReturnValue({ state: "closed", failures: 0 } as never);

    const res = await POST(new NextRequest("http://localhost/api/suno/circuit-breaker", { method: "POST" }), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(resetCircuit).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ ok: true, status: { state: "closed", failures: 0 } });
  });
});
