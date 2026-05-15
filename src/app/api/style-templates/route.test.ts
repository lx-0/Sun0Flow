import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() {
    return "postgres://test:test@localhost:5432/test";
  },
  get AUTH_SECRET() {
    return "test-secret";
  },
  get NEXTAUTH_URL() {
    return "http://localhost:3000";
  },
  get SUNOAPI_KEY() {
    return "test-key";
  },
  get SUNO_API_TIMEOUT_MS() {
    return 30000;
  },
  get RATE_LIMIT_MAX_GENERATIONS() {
    return 10;
  },
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/style-templates", () => ({
  createTemplateSchema: {
    safeParse: vi.fn((input: unknown) => ({ success: true, data: input })),
  },
  createStyleTemplate: vi.fn(),
  listStyleTemplates: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { createStyleTemplate } from "@/lib/style-templates";
import { POST } from "./route";

const seg = { params: Promise.resolve({}) } as never;

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/style-templates", {
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

describe("POST /api/style-templates", () => {
  it("creates a style template and returns 201", async () => {
    vi.mocked(createStyleTemplate).mockResolvedValue({
      ok: true,
      data: {
        template: {
          id: "tpl-1",
          userId: "user-1",
          name: "My Style",
          tags: "lofi, mellow",
        },
      },
    } as never);

    const res = await POST(makePostRequest({
      name: "My Style",
      tags: "lofi, mellow",
      sourceSongId: "song-1",
    }), seg);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(createStyleTemplate).toHaveBeenCalledWith("user-1", {
      name: "My Style",
      tags: "lofi, mellow",
      sourceSongId: "song-1",
    });
    expect(payload.template.id).toBe("tpl-1");
  });

  it("returns 404 when source song is not found", async () => {
    vi.mocked(createStyleTemplate).mockResolvedValue({
      ok: false,
      status: 404,
      error: "Source song not found",
    } as never);

    const res = await POST(makePostRequest({
      name: "My Style",
      tags: "lofi, mellow",
      sourceSongId: "missing-song",
    }), seg);

    expect(res.status).toBe(404);
  });

  it("returns 400 for service-level validation failures", async () => {
    vi.mocked(createStyleTemplate).mockResolvedValue({
      ok: false,
      status: 400,
      error: "Maximum of 50 style templates reached",
    } as never);

    const res = await POST(makePostRequest({
      name: "My Style",
      tags: "lofi, mellow",
    }), seg);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toContain("Maximum");
  });
});
