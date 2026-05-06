import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DELETE } from "./route";

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
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/generation-queue/item-1", {
    method: "DELETE",
  });
}

function makeParams(id = "item-1") {
  return { params: Promise.resolve({ id }) };
}

const baseQueueItem = {
  id: "item-1",
  userId: "user-1",
  prompt: "upbeat pop song",
  title: "Test",
  tags: "pop",
  makeInstrumental: false,
  personaId: null,
  position: 0,
  status: "pending",
  songId: null,
  errorMessage: null,
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.generationQueueItem.update).mockResolvedValue({} as never);
  vi.mocked(prisma.generationQueueItem.delete).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DELETE /api/generation-queue/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when item not found", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null);

    const res = await DELETE(makeRequest(), makeParams("nonexistent-id"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("NOT_FOUND");
  });

  it("returns 404 when item belongs to a different user", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null); // returns null because userId filter won't match

    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("deletes a pending queue item", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue({ ...baseQueueItem } as never);

    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(prisma.generationQueueItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
    expect(prisma.generationQueueItem.update).not.toHaveBeenCalled();
  });

  it("marks a processing queue item as cancelled instead of deleting", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue({
      ...baseQueueItem,
      status: "processing",
    } as never);

    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(prisma.generationQueueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { status: "cancelled" },
    });
    expect(prisma.generationQueueItem.delete).not.toHaveBeenCalled();
  });

  it("queries item with userId filter to enforce ownership", async () => {
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue({ ...baseQueueItem } as never);

    await DELETE(makeRequest(), makeParams());

    expect(prisma.generationQueueItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1", userId: "user-1" },
      })
    );
  });
});
