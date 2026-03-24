import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ---------------------------------------------------------------------------
// Correlation ID
// ---------------------------------------------------------------------------
/** Header name used to propagate a per-request correlation ID. */
export const CORRELATION_ID_HEADER = "x-correlation-id";

function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// API Versioning
// ---------------------------------------------------------------------------
/**
 * API routes that remain unversioned (auth callbacks, webhooks, internal).
 * These will NOT receive a 301 redirect to /api/v1/.
 */
const UNVERSIONED_API_PREFIXES = [
  "/api/v1/",
  "/api/auth",
  "/api/register",
  "/api/health",
  "/api/agent-skill",
  "/api/admin",
  "/api/error-report",
  "/api/metrics",
  "/api/rate-limit",
  "/api/instagram",
  "/api/suno",
  "/api/analytics",
  "/api/generation-queue",
  "/api/docs",
];

// ---------------------------------------------------------------------------
// CORS allowed origins — configured via ALLOWED_ORIGINS env var.
// Format: comma-separated list, e.g. "https://app.example.com,https://staging.example.com"
// When unset, no Access-Control-Allow-Origin header is emitted (same-origin only).
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS: string[] =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

// ---------------------------------------------------------------------------
// Body size limit
// ---------------------------------------------------------------------------
/** Maximum allowed request body size (1 MB). */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

// ---------------------------------------------------------------------------
// IP-based rate limiting (public/unauthenticated routes)
//
// Bucket        | Max Requests | Window   | Applies To
// ------------- | ------------ | -------- | ---------------------------------
// "public"      | 30           | 1 minute | /s/* (public share pages)
// "playlist"    | 100          | 1 minute | /p/* (public playlist pages)
// "embed"       | 200          | 1 minute | /embed/* (embed player pages)
// "auth"        |  5           | 1 minute | /api/register, forgot/reset password
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const ipHits = new Map<string, Map<string, number[]>>();

interface IpRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

function checkIpRateLimit(ip: string, bucket: string, max: number): IpRateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let buckets = ipHits.get(ip);
  if (!buckets) {
    buckets = new Map();
    ipHits.set(ip, buckets);
  }

  const hits = (buckets.get(bucket) ?? []).filter((t: number) => t > windowStart);
  hits.push(now);
  buckets.set(bucket, hits);

  // Periodically clean old entries to prevent memory growth
  if (ipHits.size > 10000) {
    ipHits.forEach((b, key) => {
      b.forEach((timestamps, bk) => {
        const recent = timestamps.filter((t: number) => t > windowStart);
        if (recent.length === 0) b.delete(bk);
        else b.set(bk, recent);
      });
      if (b.size === 0) ipHits.delete(key);
    });
  }

  const allowed = hits.length <= max;
  return { allowed, remaining: Math.max(0, max - hits.length), limit: max };
}

function checkPublicRateLimit(ip: string): IpRateLimitResult {
  return checkIpRateLimit(ip, "public", 30);
}

// ---------------------------------------------------------------------------
// Per-user rate limiting (authenticated API routes, in-memory sliding window)
//
// ## Redis upgrade path (multi-instance)
// Replace the `userHits` Map with Redis sorted sets:
//   ZADD  <key> <now> <requestId>
//   ZREMRANGEBYSCORE <key> 0 <windowStart>
//   ZCARD <key>   → current count
//   EXPIRE <key> 120   → TTL to auto-cleanup
// Use a key like  `rl:<userId>:<bucket>`.  Atomic pipelines (MULTI/EXEC or
// Lua scripts) prevent TOCTOU races under concurrent load.
//
// Bucket     | Max Requests | Window   | Applies To
// ---------- | ------------ | -------- | -----------------------------------------
// "api"      | 100          | 1 minute | All authenticated /api/* routes
// "generate" |  10          | 1 minute | POST /api/generate (expensive operation)
// "auth_user"|   5          | 1 minute | Auth mutation endpoints (per user)
// ---------------------------------------------------------------------------
const USER_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const userHits = new Map<string, Map<string, number[]>>();

interface UserRateLimitResult {
  allowed: boolean;
  /** Seconds to wait before the next request is allowed (only set when !allowed). */
  retryAfterSec: number;
  remaining: number;
  limit: number;
}

function checkUserRateLimit(
  userId: string,
  bucket: string,
  max: number
): UserRateLimitResult {
  const now = Date.now();
  const windowStart = now - USER_RATE_LIMIT_WINDOW_MS;

  let buckets = userHits.get(userId);
  if (!buckets) {
    buckets = new Map();
    userHits.set(userId, buckets);
  }

  const hits = (buckets.get(bucket) ?? []).filter((t: number) => t > windowStart);

  if (hits.length >= max) {
    // Retry after oldest hit rolls out of the window
    const oldestHit = hits[0];
    const retryAfterMs = oldestHit + USER_RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)), remaining: 0, limit: max };
  }

  hits.push(now);
  buckets.set(bucket, hits);

  // Periodically clean old entries to prevent memory growth
  if (userHits.size > 50000) {
    userHits.forEach((b, key) => {
      b.forEach((timestamps, bk) => {
        const recent = timestamps.filter((t: number) => t > windowStart);
        if (recent.length === 0) b.delete(bk);
        else b.set(bk, recent);
      });
      if (b.size === 0) userHits.delete(key);
    });
  }

  return { allowed: true, retryAfterSec: 0, remaining: max - hits.length, limit: max };
}

// ---------------------------------------------------------------------------
// Security headers added to every response
// ---------------------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  // HSTS — 1 year, include subdomains.  Only effective over HTTPS; harmless over HTTP.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const { pathname } = request.nextUrl;
  const method = request.method;

  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/api/auth", "/api/register", "/api/health", "/api/agent-skill", "/s/", "/p/", "/embed/"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? "unknown";

  // ── Body size guard (API routes only) ────────────────────────────────────
  // Check the Content-Length header. Clients that omit it are not blocked here
  // but Next.js itself enforces a 4 MB default; a runtime body-reading helper
  // should also enforce this limit where the body is consumed.
  if (pathname.startsWith("/api/")) {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large. Maximum size is 1 MB.", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
      );
    }
  }

  // ── API versioning — redirect deprecated /api/* to /api/v1/* ─────────────
  if (
    pathname.startsWith("/api/") &&
    !UNVERSIONED_API_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const v1Pathname = `/api/v1/${pathname.slice("/api/".length)}`;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = v1Pathname;
    // Log for migration tracking (structured so it can be grep'd / aggregated)
    console.warn(
      JSON.stringify({ event: "deprecated_api_route", method, path: pathname, redirect: v1Pathname })
    );
    return NextResponse.redirect(redirectUrl, 301);
  }

  // ── IP rate limits (public/unauthenticated pages) ────────────────────────

  // Rate limit public share pages
  if (pathname.startsWith("/s/")) {
    const { allowed, remaining, limit } = checkPublicRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" } }
      );
    }
    void remaining; // available for future header injection on success responses
  }

  // Rate limit public playlist pages: 100 req/min per IP
  if (pathname.startsWith("/p/")) {
    const { allowed, remaining, limit } = checkIpRateLimit(ip, "playlist", 100);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" } }
      );
    }
    void remaining;
  }

  // Rate limit embed player pages: 200 req/min per IP
  if (pathname.startsWith("/embed/")) {
    const { allowed, remaining, limit } = checkIpRateLimit(ip, "embed", 200);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" } }
      );
    }
    void remaining;
  }

  // Rate limit auth endpoints: 5 requests per minute per IP (brute-force protection)
  // Covers login (/api/auth/signin, /api/auth/callback/credentials), registration,
  // and password-reset flows. Disabled in CI to allow E2E test user registration.
  if (
    process.env.CI !== "true" &&
    (pathname === "/api/register" ||
      pathname === "/api/auth/forgot-password" ||
      pathname === "/api/auth/reset-password" ||
      pathname === "/api/auth/signin" ||
      pathname === "/api/auth/callback/credentials")
  ) {
    const { allowed, limit } = checkIpRateLimit(ip, "auth", 5);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  }

  // ── API key auth bypass ──────────────────────────────────────────────────
  const hasApiKeyHeader =
    pathname.startsWith("/api/") &&
    request.headers.get("authorization")?.startsWith("Bearer sk-");

  if (!token && !isPublic && !hasApiKeyHeader) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // API key auth must NOT access admin routes
  if (hasApiKeyHeader && !token && (pathname.startsWith("/admin") || pathname.startsWith("/api/admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (token && (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protect admin routes — require isAdmin on JWT token
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!token || !token.isAdmin) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ── Per-user rate limits (authenticated API routes) ──────────────────────
  const userId = token?.id as string | undefined;

  if (userId && pathname.startsWith("/api/")) {
    // Song generation: 10 req/min (expensive upstream operation)
    if (pathname === "/api/generate" && method === "POST") {
      const { allowed, retryAfterSec, remaining, limit } = checkUserRateLimit(userId, "generate", 10);
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many generation requests. Please wait before trying again.", code: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSec),
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
      void remaining;
    }

    // Auth mutation endpoints: 5 req/min per user
    if (
      pathname === "/api/auth/change-password" ||
      pathname === "/api/auth/forgot-password" ||
      pathname === "/api/auth/reset-password"
    ) {
      const { allowed, retryAfterSec, limit } = checkUserRateLimit(userId, "auth_user", 5);
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please wait before trying again.", code: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSec),
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
    }

    // General API: 100 req/min per user (catch-all, applied last)
    const { allowed, retryAfterSec, remaining, limit } = checkUserRateLimit(userId, "api", 100);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
    void remaining;
  }

  // ── CORS — OPTIONS preflight ─────────────────────────────────────────────
  const origin = request.headers.get("origin") ?? "";
  const isAllowedOrigin = ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin);

  if (method === "OPTIONS" && pathname.startsWith("/api/")) {
    const preflightResponse = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin) {
      preflightResponse.headers.set("Access-Control-Allow-Origin", origin);
      preflightResponse.headers.set("Vary", "Origin");
      preflightResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      preflightResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      preflightResponse.headers.set("Access-Control-Max-Age", "86400");
    }
    return preflightResponse;
  }

  // ── Correlation ID ───────────────────────────────────────────────────────
  const correlationId =
    request.headers.get(CORRELATION_ID_HEADER) ?? generateCorrelationId();

  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        [CORRELATION_ID_HEADER]: correlationId,
      }),
    },
  });

  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  // ── Security headers ─────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Suppress framework fingerprinting
  response.headers.delete("X-Powered-By");

  // ── API version header ───────────────────────────────────────────────────
  // Inform clients which version they're actually talking to.
  if (pathname.startsWith("/api/v1/")) {
    response.headers.set("X-API-Version", "1");
  }

  // ── CORS response headers ────────────────────────────────────────────────
  if (isAllowedOrigin && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json).*)"],
};
