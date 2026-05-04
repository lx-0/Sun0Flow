import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { authRoute, adminRoute } from "@/lib/route-handler";

vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser, requireAdmin } from "@/lib/auth-resolver";
import { logServerError } from "@/lib/error-logger";

function makeRequest(url = "http://localhost/api/test") {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authRoute", () => {
  it("returns auth error when resolveUser fails", async () => {
    const errorResponse = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: errorResponse,
    });

    const handler = authRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequest());

    expect(result.status).toBe(401);
  });

  it("passes auth context to handler on success", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-123",
      isApiKey: false,
      isAdmin: true,
      error: null,
    });

    const handler = authRoute(async (_req, { auth }) => {
      return NextResponse.json({
        userId: auth.userId,
        isApiKey: auth.isApiKey,
        isAdmin: auth.isAdmin,
      });
    });

    const result = await handler(makeRequest());
    const body = await result.json();

    expect(body.userId).toBe("user-123");
    expect(body.isApiKey).toBe(false);
    expect(body.isAdmin).toBe(true);
  });

  it("resolves dynamic params from segment data", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-123",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });

    const handler = authRoute<{ id: string }>(async (_req, { params }) => {
      return NextResponse.json({ id: params.id });
    });

    const result = await handler(makeRequest(), {
      params: Promise.resolve({ id: "song-456" }),
    });
    const body = await result.json();

    expect(body.id).toBe("song-456");
  });

  it("catches unhandled errors and returns 500", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-123",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });

    const handler = authRoute(async () => {
      throw new Error("Database connection failed");
    });

    const result = await handler(makeRequest());

    expect(result.status).toBe(500);
    const body = await result.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("logs server errors with user context", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-123",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });

    const handler = authRoute(
      async () => {
        throw new Error("Something broke");
      },
      { route: "/api/test" }
    );

    await handler(makeRequest());

    expect(logServerError).toHaveBeenCalledWith(
      "route-handler",
      expect.any(Error),
      { userId: "user-123", route: "/api/test" }
    );
  });
});

describe("adminRoute", () => {
  it("returns error when requireAdmin fails", async () => {
    const errorResponse = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    vi.mocked(requireAdmin).mockResolvedValue({
      error: errorResponse,
      session: null,
      user: null,
    });

    const handler = adminRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequest());

    expect(result.status).toBe(403);
  });

  it("passes admin context to handler on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      error: null,
      session: {} as never,
      user: { id: "admin-1", isAdmin: true },
    });

    const handler = adminRoute(async (_req, { admin }) => {
      return NextResponse.json({ adminId: admin.adminId });
    });

    const result = await handler(makeRequest());
    const body = await result.json();

    expect(body.adminId).toBe("admin-1");
  });

  it("catches unhandled errors in admin routes", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      error: null,
      session: {} as never,
      user: { id: "admin-1", isAdmin: true },
    });

    const handler = adminRoute(async () => {
      throw new Error("Admin action failed");
    });

    const result = await handler(makeRequest());

    expect(result.status).toBe(500);
    expect(logServerError).toHaveBeenCalledWith(
      "admin-route-handler",
      expect.any(Error),
      { userId: "admin-1", route: "/api/test" }
    );
  });
});
