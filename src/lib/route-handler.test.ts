import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { authRoute, optionalAuthRoute, publicRoute, adminRoute, cronRoute } from "@/lib/route-handler";

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser, requireAdmin } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";

function makeRequest(url = "http://localhost/api/test") {
  return new NextRequest(url);
}

const seg = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authRoute", () => {
  it("returns auth error when resolveUser fails", async () => {
    const errorResponse = NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: errorResponse,
    });

    const handler = authRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequest(), seg);

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

    const result = await handler(makeRequest(), seg);
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

    const result = await handler(makeRequest(), seg);

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

    await handler(makeRequest(), seg);

    expect(logServerError).toHaveBeenCalledWith(
      "route-handler",
      expect.any(Error),
      { userId: "user-123", route: "/api/test" }
    );
  });
});

describe("optionalAuthRoute", () => {
  it("passes authenticated user context when session exists", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-123",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });

    const handler = optionalAuthRoute(async (_req, { auth }) => {
      return NextResponse.json({
        userId: auth.userId,
        isApiKey: auth.isApiKey,
      });
    });

    const result = await handler(makeRequest(), seg);
    const body = await result.json();

    expect(body.userId).toBe("user-123");
    expect(body.isApiKey).toBe(false);
  });

  it("passes null userId when not authenticated instead of returning error", async () => {
    const errorResponse = NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: errorResponse,
    });

    const handler = optionalAuthRoute(async (_req, { auth }) => {
      return NextResponse.json({ userId: auth.userId });
    });

    const result = await handler(makeRequest(), seg);

    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.userId).toBeNull();
  });

  it("catches unhandled errors and returns 500", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });

    const handler = optionalAuthRoute(async () => {
      throw new Error("Handler crashed");
    });

    const result = await handler(makeRequest(), seg);

    expect(result.status).toBe(500);
    expect(logServerError).toHaveBeenCalledWith(
      "optional-auth-route-handler",
      expect.any(Error),
      expect.objectContaining({ userId: null })
    );
  });
});

describe("publicRoute", () => {
  it("calls handler without auth context", async () => {
    const handler = publicRoute(async () => {
      return NextResponse.json({ ok: true });
    });

    const result = await handler(makeRequest(), seg);
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("resolves dynamic params from segment data", async () => {
    const handler = publicRoute<{ username: string }>(async (_req, { params }) => {
      return NextResponse.json({ username: params.username });
    });

    const result = await handler(makeRequest(), {
      params: Promise.resolve({ username: "testuser" }),
    });
    const body = await result.json();

    expect(body.username).toBe("testuser");
  });

  it("catches unhandled errors and returns 500", async () => {
    const handler = publicRoute(
      async () => {
        throw new Error("Public route crashed");
      },
      { route: "/api/public/test" }
    );

    const result = await handler(makeRequest(), seg);

    expect(result.status).toBe(500);
    const body = await result.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(logServerError).toHaveBeenCalledWith(
      "public-route-handler",
      expect.any(Error),
      { route: "/api/public/test" }
    );
  });
});

describe("adminRoute", () => {
  it("returns error when requireAdmin fails", async () => {
    const errorResponse = NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    vi.mocked(requireAdmin).mockResolvedValue({
      error: errorResponse,
      session: null,
      user: null,
    });

    const handler = adminRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequest(), seg);

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

    const result = await handler(makeRequest(), seg);
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

    const result = await handler(makeRequest(), seg);

    expect(result.status).toBe(500);
    expect(logServerError).toHaveBeenCalledWith(
      "admin-route-handler",
      expect.any(Error),
      { userId: "admin-1", route: "/api/test" }
    );
  });
});

describe("cronRoute", () => {
  function makeRequestWithAuth(token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers["authorization"] = token;
    return new NextRequest("http://localhost/api/cron/test", { headers });
  }

  it("returns 401 when no authorization header is provided", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const handler = cronRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequestWithAuth());

    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body.code).toBe("UNAUTHORIZED");
    vi.unstubAllEnvs();
  });

  it("returns 401 when token does not match CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const handler = cronRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequestWithAuth("Bearer wrong-secret"));

    expect(result.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns 401 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const handler = cronRoute(async () => NextResponse.json({ ok: true }));
    const result = await handler(makeRequestWithAuth("Bearer anything"));

    expect(result.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("calls handler when token matches CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const handler = cronRoute(async () =>
      NextResponse.json({ processed: 5 })
    );
    const result = await handler(makeRequestWithAuth("Bearer test-secret"));

    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.processed).toBe(5);
    vi.unstubAllEnvs();
  });

  it("catches unhandled errors and returns 500", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const handler = cronRoute(
      async () => {
        throw new Error("Cron job failed");
      },
      { route: "/api/cron/test" }
    );
    const result = await handler(makeRequestWithAuth("Bearer test-secret"));

    expect(result.status).toBe(500);
    const body = await result.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(logServerError).toHaveBeenCalledWith(
      "cron-route-handler",
      expect.any(Error),
      { route: "/api/cron/test" }
    );
    vi.unstubAllEnvs();
  });
});
