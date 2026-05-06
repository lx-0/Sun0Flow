import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

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
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(method: string, body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/generation-queue", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
  createdAt: new Date("2026-03-27T00:00:00Z"),
  updatedAt: new Date("2026-03-27T00:00:00Z"),
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/generation-queue", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("returns pending and processing queue items for user", async () => {
    vi.mocked(prisma.generationQueueItem.findMany).mockResolvedValue([
      { ...baseQueueItem },
      { ...baseQueueItem, id: "item-2", status: "processing", position: 1 },
    ] as never);

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0].id).toBe("item-1");
    expect(data.items[1].id).toBe("item-2");
  });

  it("queries only pending and processing statuses for the current user", async () => {
    vi.mocked(prisma.generationQueueItem.findMany).mockResolvedValue([]);

    await GET(makeRequest("GET"));

    expect(prisma.generationQueueItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: { in: ["pending", "processing"] } },
        orderBy: { position: "asc" },
      })
    );
  });

  it("returns empty items array when queue is empty", async () => {
    vi.mocked(prisma.generationQueueItem.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(0);
  });
});

describe("POST /api/generation-queue", () => {
  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest("POST", { prompt: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty prompt", async () => {
    const res = await POST(makeRequest("POST", { prompt: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt is required");
  });

  it("returns 400 for missing prompt", async () => {
    const res = await POST(makeRequest("POST", { title: "No prompt" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for prompt exceeding 3000 characters", async () => {
    const res = await POST(makeRequest("POST", { prompt: "a".repeat(3001) }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("3000 characters");
  });

  it("returns 400 when queue is full (10 items)", async () => {
    vi.mocked(prisma.generationQueueItem.count).mockResolvedValue(10);

    const res = await POST(makeRequest("POST", { prompt: "new song" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Queue is full");
  });

  it("creates queue item with next position when queue has existing items", async () => {
    vi.mocked(prisma.generationQueueItem.count).mockResolvedValue(2);
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue({ position: 1 } as never);
    vi.mocked(prisma.generationQueueItem.create).mockResolvedValue({
      ...baseQueueItem,
      position: 2,
    } as never);

    const res = await POST(makeRequest("POST", { prompt: "upbeat pop song", title: "Test", tags: "pop" }));
    expect(res.status).toBe(201);

    expect(prisma.generationQueueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          prompt: "upbeat pop song",
          position: 2,
        }),
      })
    );
  });

  it("creates queue item at position 0 when queue is empty", async () => {
    vi.mocked(prisma.generationQueueItem.count).mockResolvedValue(0);
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.generationQueueItem.create).mockResolvedValue({
      ...baseQueueItem,
      position: 0,
    } as never);

    const res = await POST(makeRequest("POST", { prompt: "first song" }));
    expect(res.status).toBe(201);

    expect(prisma.generationQueueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 0 }),
      })
    );
  });

  it("returns the created queue item", async () => {
    vi.mocked(prisma.generationQueueItem.count).mockResolvedValue(0);
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.generationQueueItem.create).mockResolvedValue({ ...baseQueueItem } as never);

    const res = await POST(makeRequest("POST", { prompt: "upbeat pop song" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.item.id).toBe("item-1");
    expect(data.item.prompt).toBe("upbeat pop song");
  });

  it("sets makeInstrumental and personaId on the queue item", async () => {
    vi.mocked(prisma.generationQueueItem.count).mockResolvedValue(0);
    vi.mocked(prisma.generationQueueItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.generationQueueItem.create).mockResolvedValue({
      ...baseQueueItem,
      makeInstrumental: true,
      personaId: "persona-1",
    } as never);

    await POST(makeRequest("POST", {
      prompt: "instrumental",
      makeInstrumental: true,
      personaId: "persona-1",
    }));

    expect(prisma.generationQueueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          makeInstrumental: true,
          personaId: "persona-1",
        }),
      })
    );
  });
});
