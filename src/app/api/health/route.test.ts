import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

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
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

import { prisma } from "@/lib/prisma";

describe("GET /api/health", () => {
  const request = new NextRequest("http://localhost/api/health");
  const segmentData = { params: Promise.resolve({}) };

  it("returns status ok when DB is healthy", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET(request, segmentData);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.db).toBe(true);
    expect(typeof data.uptime).toBe("number");
  });

  it("returns status error when DB is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Connection refused"));

    const res = await GET(request, segmentData);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe("error");
    expect(data.db).toBe(false);
  });
});
