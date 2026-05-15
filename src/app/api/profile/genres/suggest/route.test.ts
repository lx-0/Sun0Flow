import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";

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

vi.mock("@/lib/llm", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { generateText } from "@/lib/llm";

const seg = { params: Promise.resolve({}) };

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/profile/genres/suggest", {
    method: "POST",
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

describe("POST /api/profile/genres/suggest", () => {
  it("returns auth error when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await POST(makeRequest({ currentGenres: [] }), seg);
    expect(res.status).toBe(401);
  });

  it("returns validation error when currentGenres is not an array", async () => {
    const res = await POST(makeRequest({ currentGenres: "rock" as unknown as string[] }), seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns normalized suggestions from a direct JSON array response", async () => {
    vi.mocked(generateText).mockResolvedValue(
      `["Alt Rock", "Synthwave", "Rock", "", "  Indie Pop  "]`
    );

    const res = await POST(makeRequest({ currentGenres: ["rock"] }), seg);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toEqual(["alt rock", "synthwave", "indie pop"]);
  });

  it("extracts array from wrapped text response", async () => {
    vi.mocked(generateText).mockResolvedValue(
      `Try these: ["Future Bass", "Lo-Fi House"]`
    );

    const res = await POST(makeRequest({ currentGenres: ["trance"], partial: "bass" }), seg);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toEqual(["future bass", "lo-fi house"]);
  });

  it("returns empty suggestions when LLM response is null", async () => {
    vi.mocked(generateText).mockResolvedValue(null);

    const res = await POST(makeRequest({ currentGenres: ["pop"] }), seg);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toEqual([]);
  });
});
