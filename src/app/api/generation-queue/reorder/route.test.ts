import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generationQueueItem: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/generation-queue/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.generationQueueItem.findMany).mockResolvedValue([
    { id: "item-1" },
    { id: "item-2" },
    { id: "item-3" },
  ] as never);
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/generation-queue/reorder", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest({ orderedIds: ["item-1", "item-2"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when orderedIds is not an array", async () => {
    const res = await POST(makeRequest({ orderedIds: "not-an-array" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("orderedIds must be an array");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when orderedIds is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("reorders items that belong to the user", async () => {
    const res = await POST(makeRequest({ orderedIds: ["item-2", "item-1", "item-3"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Should run a transaction
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("only updates positions for items owned by the user", async () => {
    // item-4 is not in user's queue, so should be filtered out
    vi.mocked(prisma.generationQueueItem.findMany).mockResolvedValue([
      { id: "item-1" },
      { id: "item-2" },
    ] as never);

    await POST(makeRequest({ orderedIds: ["item-4", "item-1", "item-2"] }));

    // Should query only pending items owned by the user
    expect(prisma.generationQueueItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          status: "pending",
        }),
      })
    );
  });

  it("returns success true on valid reorder", async () => {
    const res = await POST(makeRequest({ orderedIds: ["item-3", "item-1", "item-2"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
