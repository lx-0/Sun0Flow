import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    errorReport: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("POST /api/error-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts chunk-load-error reports", async () => {
    vi.mocked(prisma.errorReport.create).mockResolvedValue({ id: "err-1" } as never);

    const req = new Request("http://localhost/api/error-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({
        message: "Loading chunk 123 failed",
        stack: "ChunkLoadError: Loading chunk 123 failed",
        url: "http://localhost/songs/abc",
        userAgent: "vitest",
        source: "chunk-load-error",
      }),
    });

    const res = await POST(req as never);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ status: "ok" });
    expect(prisma.errorReport.create).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown sources", async () => {
    const req = new Request("http://localhost/api/error-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "boom",
        url: "http://localhost",
        source: "random-source",
      }),
    });

    const res = await POST(req as never);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toContain("source must start with one of");
    expect(prisma.errorReport.create).not.toHaveBeenCalled();
  });
});
