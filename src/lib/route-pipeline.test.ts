import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runRoutePipeline } from "@/lib/route-pipeline";

vi.mock("@/lib/query-params", () => ({
  parseQueryParams: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { parseQueryParams } from "@/lib/query-params";
import { logServerError } from "@/lib/error-logger";

describe("runRoutePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves params, body and query, then calls execute", async () => {
    vi.mocked(parseQueryParams).mockReturnValue({
      data: { page: 2 },
    });

    const request = new NextRequest("http://localhost/api/test?page=2", {
      method: "POST",
      body: JSON.stringify({ title: "hello" }),
    });

    const result = await runRoutePipeline(
      request,
      { params: Promise.resolve({ id: "song-1" }) },
      {
        body: z.object({ title: z.string() }),
        query: z.object({ page: z.number() }),
      },
      "test-route",
      { userId: "user-1" },
      async ({ params, body, query }) =>
        NextResponse.json({ id: params.id, title: body.title, page: query.page }),
    );

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ id: "song-1", title: "hello", page: 2 });
  });

  it("returns 400 for invalid json body", async () => {
    const request = new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: "{not-json",
    });

    const result = await runRoutePipeline(
      request,
      { params: Promise.resolve({}) },
      { body: z.object({ title: z.string() }) },
      "test-route",
      {},
      async () => NextResponse.json({ ok: true }),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Invalid JSON body",
    });
  });

  it("returns 400 when body validation fails", async () => {
    const request = new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ title: 123 }),
    });

    const result = await runRoutePipeline(
      request,
      { params: Promise.resolve({}) },
      { body: z.object({ title: z.string().min(1) }) },
      "test-route",
      {},
      async () => NextResponse.json({ ok: true }),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("returns query parsing error response", async () => {
    vi.mocked(parseQueryParams).mockReturnValue({
      error: NextResponse.json(
        { error: "Invalid query", code: "BAD_REQUEST" },
        { status: 400 },
      ),
    });

    const request = new NextRequest("http://localhost/api/test?page=oops");
    const result = await runRoutePipeline(
      request,
      { params: Promise.resolve({}) },
      { query: z.object({ page: z.number() }) },
      "test-route",
      {},
      async () => NextResponse.json({ ok: true }),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      error: "Invalid query",
      code: "BAD_REQUEST",
    });
  });

  it("logs unhandled errors and returns 500", async () => {
    const request = new NextRequest("http://localhost/api/test");

    const result = await runRoutePipeline(
      request,
      { params: Promise.resolve({}) },
      undefined,
      "test-route",
      { userId: "user-1" },
      async () => {
        throw new Error("boom");
      },
    );

    expect(result.status).toBe(500);
    await expect(result.json()).resolves.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(logServerError).toHaveBeenCalledWith(
      "test-route",
      expect.any(Error),
      { userId: "user-1", route: "/api/test" },
    );
  });
});
