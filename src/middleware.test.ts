import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

// next-intl middleware — in tests, just pass the request through unchanged
vi.mock("next-intl/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    default: vi.fn(() => vi.fn(() => NextResponse.next())),
  };
});

vi.mock("@/i18n/routing", () => ({
  routing: {
    locales: ["en", "de", "ja"],
    defaultLocale: "en",
  },
}));

import { getToken } from "next-auth/jwt";
import { middleware } from "./middleware";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; contentLength?: number } = {}
): NextRequest {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.contentLength !== undefined) {
    headers["content-length"] = String(opts.contentLength);
  }
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(getToken).mockResolvedValue(null);
  process.env.CI = "true"; // Disable IP rate limiting in tests
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("middleware — protected route access", () => {
  it("redirects unauthenticated users to /login for protected routes", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("allows authenticated users through protected routes", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/dashboard"));
    // NextResponse.next() returns 200 in tests
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("allows unauthenticated access to /login", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/login"));
    expect(res.status).not.toBe(307);
  });

  it("allows unauthenticated access to /register", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/register"));
    expect(res.status).not.toBe(307);
  });

  it("allows unauthenticated access to /api/register", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/api/register", { method: "POST" }));
    expect(res.status).not.toBe(307);
  });

  it("allows unauthenticated access to /api/health", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/api/health"));
    expect(res.status).not.toBe(307);
  });

  it("redirects authenticated users away from /login to /", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/login"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/");
  });

  it("redirects authenticated users away from /register to /", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/register"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/");
  });
});

describe("middleware — API key auth bypass", () => {
  it("allows API key bearer tokens to access API routes without a session", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(
      makeRequest("http://localhost/api/v1/songs", {
        headers: { authorization: "Bearer sk-abc123def456" },
      })
    );
    // Should NOT redirect to login
    expect(res.status).not.toBe(307);
  });

  it("blocks API key auth on admin API routes (returns 403)", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(
      makeRequest("http://localhost/api/admin/users", {
        headers: { authorization: "Bearer sk-abc123def456" },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("middleware — admin route protection", () => {
  it("blocks non-admin authenticated users from /api/admin (403)", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1", isAdmin: false } as never);

    const res = await middleware(makeRequest("http://localhost/api/admin/users"));
    expect(res.status).toBe(403);
  });

  it("allows admin users to access /api/admin routes", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "admin-1", sub: "admin-1", isAdmin: true } as never);

    const res = await middleware(makeRequest("http://localhost/api/admin/users"));
    expect(res.status).not.toBe(403);
  });

  it("redirects unauthenticated users from /admin page to /", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/admin/dashboard"));
    // unauthenticated → redirected to login first (public check)
    expect(res.status).toBe(307);
  });

  it("redirects non-admin authenticated users from /admin page to /", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1", isAdmin: false } as never);

    const res = await middleware(makeRequest("http://localhost/admin/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/");
  });
});

describe("middleware — body size limit", () => {
  it("returns 413 when Content-Length exceeds 1 MB", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(
      makeRequest("http://localhost/api/v1/generate", {
        method: "POST",
        contentLength: 2 * 1024 * 1024, // 2 MB
      })
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("allows requests within the 1 MB body size limit", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(
      makeRequest("http://localhost/api/v1/generate", {
        method: "POST",
        contentLength: 512 * 1024, // 512 KB
      })
    );
    expect(res.status).not.toBe(413);
  });
});

describe("middleware — API versioning", () => {
  it("passes through /api/* routes without redirect (rewrite handled by next.config.mjs)", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/api/songs"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect /api/v1/ routes", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/api/v1/songs"));
    expect(res.status).not.toBe(301);
  });

  it("does not redirect unversioned exempt routes (e.g. /api/auth)", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(makeRequest("http://localhost/api/auth/session"));
    expect(res.status).not.toBe(301);
  });
});

describe("middleware — security headers", () => {
  it("adds X-Content-Type-Options header to responses", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/api/v1/songs"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("adds X-Frame-Options: DENY header", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/api/v1/songs"));
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("adds Strict-Transport-Security header", async () => {
    vi.mocked(getToken).mockResolvedValue({ id: "user-1", sub: "user-1" } as never);

    const res = await middleware(makeRequest("http://localhost/api/v1/songs"));
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });
});
