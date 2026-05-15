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
  patchTemplateSchema: {
    safeParse: vi.fn((input: unknown) => ({ success: true, data: input })),
  },
  updateStyleTemplate: vi.fn(),
  deleteStyleTemplate: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { deleteStyleTemplate, updateStyleTemplate } from "@/lib/style-templates";
import { DELETE, PATCH } from "./route";

const seg = { params: Promise.resolve({ id: "tpl-1" }) } as never;

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/style-templates/tpl-1", {
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

describe("PATCH /api/style-templates/[id]", () => {
  it("returns mapped service errors with original code", async () => {
    vi.mocked(updateStyleTemplate).mockResolvedValue({
      ok: false,
      status: 400,
      error: "No fields to update",
      code: "VALIDATION_ERROR",
    } as never);

    const res = await PATCH(makePatchRequest({}) as never, seg);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "No fields to update",
    });
  });
});

describe("DELETE /api/style-templates/[id]", () => {
  it("returns mapped not-found code from service", async () => {
    vi.mocked(deleteStyleTemplate).mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
      code: "NOT_FOUND",
    } as never);

    const res = await DELETE(new NextRequest("http://localhost/api/style-templates/tpl-1") as never, seg);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "NOT_FOUND" });
  });
});
