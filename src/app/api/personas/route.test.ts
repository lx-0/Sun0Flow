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

vi.mock("@/lib/personas", () => ({
  listPersonas: vi.fn(),
  createPersona: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { listPersonas, createPersona } from "@/lib/personas";
import { GET, POST } from "./route";

const seg = { params: Promise.resolve({}) };

function makeRequest(rawBody: string) {
  return new NextRequest("http://localhost/api/personas", {
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

describe("GET /api/personas", () => {
  it("returns personas list", async () => {
    vi.mocked(listPersonas).mockResolvedValue({
      ok: true,
      data: [{ id: "1", personaId: "p1", name: "My Persona", description: null, style: null, sourceSongId: null, createdAt: new Date() }],
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/personas"), seg);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.personas).toHaveLength(1);
  });
});

describe("POST /api/personas", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{") as never, seg);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest(JSON.stringify({ taskId: "task-1" })) as never, seg);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("passes validated body to createPersona", async () => {
    vi.mocked(createPersona).mockResolvedValue({
      ok: true,
      data: { id: "1", personaId: "p1", name: "Clean Name", description: null, style: null, sourceSongId: null, createdAt: new Date() },
    } as never);

    const res = await POST(makeRequest(JSON.stringify({ taskId: "task-1", name: "Clean Name" })) as never, seg);

    expect(res.status).toBe(201);
    expect(createPersona).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ taskId: "task-1", name: "Clean Name" }),
    );
  });
});
