import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/songs/batch", () => ({
  executeBatch: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { executeBatch } from "@/lib/songs/batch";
import { POST } from "./route";

const seg = { params: Promise.resolve({}) };

function makeRequest(rawBody: string) {
  return new NextRequest("http://localhost/api/songs/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
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

describe("POST /api/songs/batch", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{") as never, seg);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty songIds", async () => {
    const res = await POST(makeRequest(JSON.stringify({ action: "favorite", songIds: [] })) as never, seg);
    expect(res.status).toBe(400);
  });

  it("passes validated payload to executeBatch", async () => {
    vi.mocked(executeBatch).mockResolvedValue({
      ok: true,
      action: "favorite",
      affected: 2,
      songIds: ["s1", "s2"],
    } as never);

    const res = await POST(
      makeRequest(JSON.stringify({ action: "favorite", songIds: ["s1", "s2"] })) as never,
      seg,
    );

    expect(res.status).toBe(200);
    expect(executeBatch).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ action: "favorite", songIds: ["s1", "s2"] }),
    );
  });
});
