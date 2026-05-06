import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { applyRequestRateLimits } from "@/lib/rate-limit/sliding-window";

// next-intl locale middleware — handles locale detection and URL rewriting
const intlMiddleware = createMiddleware(routing);

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
// External consumers use /api/v1/* which is transparently rewritten to /api/*
// by next.config.mjs (afterFiles rewrite). No middleware redirect needed.

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
// Locale-prefixed public path helpers
// ---------------------------------------------------------------------------
// Paths that are public regardless of locale prefix (e.g. /login, /de/login)
const PUBLIC_PATH_SUFFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

function stripLocalePrefix(pathname: string): string {
  // Strip /en, /de, /ja prefix if present
  return pathname.replace(/^\/(en|de|ja)(?=\/|$)/, "") || "/";
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const secureCookie = process.env.AUTH_URL?.startsWith("https://") ?? false;
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie });
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Strip locale prefix for path matching (so /de/login matches /login)
  const pathnameWithoutLocale = stripLocalePrefix(pathname);

  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/api/auth", "/api/register", "/api/health", "/api/agent-skill", "/api/test/login", "/s/", "/p/", "/u/", "/songs/", "/embed/"];
  const isPublic =
    pathnameWithoutLocale === "/" ||
    publicPaths.some((p) => pathnameWithoutLocale.startsWith(p) || pathname.startsWith(p));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // ── Body size guard (API routes only) ────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large. Maximum size is 1 MB.", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
      );
    }
  }

  // ── Rate limits (IP-based + per-user) ────────────────────────────────────
  const userId = token?.id as string | undefined;
  const isAdmin = Boolean(token?.isAdmin);
  const isE2eUser = typeof token?.email === "string" && token.email.endsWith("@test.local");

  const rateLimitResponse = applyRequestRateLimits({
    pathname,
    method,
    ip,
    userId,
    isAdmin,
    isE2eUser,
  });
  if (rateLimitResponse) return rateLimitResponse;

  // ── API key auth bypass ──────────────────────────────────────────────────
  const hasApiKeyHeader =
    pathname.startsWith("/api/") &&
    request.headers.get("authorization")?.startsWith("Bearer sk-");

  if (!token && !isPublic && !hasApiKeyHeader) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // API key auth must NOT access admin routes
  if (hasApiKeyHeader && !token && (pathnameWithoutLocale.startsWith("/admin") || pathname.startsWith("/api/admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (token && PUBLIC_PATH_SUFFIXES.some((p) => pathnameWithoutLocale === p)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protect admin routes — require isAdmin on JWT token
  if (pathnameWithoutLocale.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!token || !token.isAdmin) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
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

  // ── Locale routing (non-API, non-static routes) ──────────────────────────
  let response: NextResponse;
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/s/") && !pathname.startsWith("/p/") && !pathname.startsWith("/u/") && !pathname.startsWith("/songs/") && !pathname.startsWith("/embed/")) {
    const intlResponse = intlMiddleware(request);
    response = intlResponse as NextResponse;
  } else {
    response = NextResponse.next({
      request: {
        headers: new Headers({
          ...Object.fromEntries(request.headers),
          [CORRELATION_ID_HEADER]: correlationId,
        }),
      },
    });
  }

  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  // ── Security headers ─────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Suppress framework fingerprinting
  response.headers.delete("X-Powered-By");

  // ── API version header ───────────────────────────────────────────────────
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
  matcher: ["/((?!_next/|favicon.ico|manifest.json|icons/|sw.js).*)"],
};
