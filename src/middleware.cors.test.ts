/**
 * CORS configuration tests for the Next.js middleware.
 *
 * ALLOWED_ORIGINS is evaluated at module-load time, so these tests use
 * vi.resetModules() + dynamic imports inside beforeAll to ensure the
 * middleware module is loaded with the correct env var value.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";

// We type the middleware function without a static import of the module
// (a static import would load the module before beforeAll runs).
type MiddlewareFn = (req: NextRequest) => Promise<Response>;

let middlewareFn: MiddlewareFn;
const ALLOWED = "https://allowed.example.com";
const ALSO_ALLOWED = "https://also-allowed.example.com";
const BLOCKED = "https://blocked.example.com";

const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

beforeAll(async () => {
  process.env.ALLOWED_ORIGINS = `${ALLOWED},${ALSO_ALLOWED}`;

  // Set up mocks before dynamic import so the loaded middleware sees them
  vi.doMock("next-auth/jwt", () => ({
    getToken: vi.fn().mockResolvedValue({ id: "cors-user", sub: "cors-user" }),
  }));

  vi.doMock("next-intl/middleware", async () => {
    const { NextResponse } = await import("next/server");
    return { default: vi.fn(() => vi.fn(() => NextResponse.next())) };
  });

  vi.doMock("@/i18n/routing", () => ({
    routing: { locales: ["en", "de", "ja"], defaultLocale: "en" },
  }));

  const mod = await import("./middleware");
  middlewareFn = mod.middleware;
});

afterAll(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  }
  vi.restoreAllMocks();
});

function makeRequest(
  url: string,
  opts: { method?: string; origin?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.origin) headers["origin"] = opts.origin;
  return new NextRequest(url, { method: opts.method ?? "GET", headers });
}

describe("middleware — CORS preflight (OPTIONS)", () => {
  it("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { method: "OPTIONS", origin: ALLOWED })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("returns 204 for a second allowed origin", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { method: "OPTIONS", origin: ALSO_ALLOWED })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALSO_ALLOWED);
  });

  it("returns 204 WITHOUT CORS headers for a disallowed origin", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { method: "OPTIONS", origin: BLOCKED })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns 204 WITHOUT CORS headers when no origin header is sent", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sets Access-Control-Max-Age on preflight for allowed origin", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/generate", { method: "OPTIONS", origin: ALLOWED })
    );
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });
});

describe("middleware — CORS on regular requests", () => {
  it("adds Access-Control-Allow-Origin for an allowed origin on a regular GET", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { origin: ALLOWED })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("does NOT add Access-Control-Allow-Origin for a disallowed origin", async () => {
    const res = await middlewareFn(
      makeRequest("http://localhost/api/songs", { origin: BLOCKED })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does NOT add Access-Control-Allow-Origin when no origin header is sent", async () => {
    const res = await middlewareFn(makeRequest("http://localhost/api/songs"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
