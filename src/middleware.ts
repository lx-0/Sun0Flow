import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { applyRequestRateLimits } from "@/lib/rate-limit/sliding-window";

const intlMiddleware = createMiddleware(routing);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CORRELATION_ID_HEADER = "x-correlation-id";

const MAX_BODY_BYTES = 1 * 1024 * 1024;

const ALLOWED_ORIGINS: string[] =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const PUBLIC_PATHS = [
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email",
  "/api/auth", "/api/register", "/api/health", "/api/agent-skill", "/api/test/login",
  "/api/songs/public",
  "/s/", "/p/", "/u/", "/songs/", "/embed/",
];

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

const PASSTHROUGH_PREFIXES = ["/api/", "/s/", "/p/", "/u/", "/songs/", "/embed/"];

// ---------------------------------------------------------------------------
// Shared context — resolved once per request, consumed by each concern
// ---------------------------------------------------------------------------

interface MiddlewareContext {
  pathname: string;
  pathnameWithoutLocale: string;
  method: string;
  ip: string;
  token: JWT | null;
  userId: string | undefined;
  isAdmin: boolean;
  isE2eUser: boolean;
  isPublic: boolean;
  hasApiKeyHeader: boolean;
  origin: string;
  isAllowedOrigin: boolean;
  correlationId: string;
}

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(en|de|ja)(?=\/|$)/, "") || "/";
}

function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function resolveContext(request: NextRequest): Promise<MiddlewareContext> {
  const secureCookie = process.env.AUTH_URL?.startsWith("https://") ?? false;
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie });
  const { pathname } = request.nextUrl;
  const pathnameWithoutLocale = stripLocalePrefix(pathname);
  const method = request.method;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const origin = request.headers.get("origin") ?? "";

  const isPublic =
    pathnameWithoutLocale === "/" ||
    PUBLIC_PATHS.some((p) => pathnameWithoutLocale.startsWith(p) || pathname.startsWith(p));

  const hasApiKeyHeader =
    pathname.startsWith("/api/") &&
    request.headers.get("authorization")?.startsWith("Bearer sk-") === true;

  return {
    pathname,
    pathnameWithoutLocale,
    method,
    ip,
    token,
    userId: token?.id as string | undefined,
    isAdmin: Boolean(token?.isAdmin),
    isE2eUser: typeof token?.email === "string" && token.email.endsWith("@test.local"),
    isPublic,
    hasApiKeyHeader,
    origin,
    isAllowedOrigin: ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin),
    correlationId: request.headers.get(CORRELATION_ID_HEADER) ?? generateCorrelationId(),
  };
}

// ---------------------------------------------------------------------------
// Concern: body size guard (API routes only)
// ---------------------------------------------------------------------------

function checkBodySize(request: NextRequest, ctx: MiddlewareContext): NextResponse | null {
  if (!ctx.pathname.startsWith("/api/")) return null;
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Request body too large. Maximum size is 1 MB.", code: "PAYLOAD_TOO_LARGE" },
      { status: 413 },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Concern: authentication and authorization
// ---------------------------------------------------------------------------

function enforceAuth(request: NextRequest, ctx: MiddlewareContext): NextResponse | null {
  if (!ctx.token && !ctx.isPublic && !ctx.hasApiKeyHeader) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (ctx.hasApiKeyHeader && !ctx.token) {
    if (ctx.pathnameWithoutLocale.startsWith("/admin") || ctx.pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (ctx.token && AUTH_PAGES.some((p) => ctx.pathnameWithoutLocale === p)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (ctx.pathnameWithoutLocale.startsWith("/admin") || ctx.pathname.startsWith("/api/admin")) {
    if (!ctx.token || !ctx.token.isAdmin) {
      return ctx.pathname.startsWith("/api/admin")
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/", request.url));
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Concern: CORS preflight
// ---------------------------------------------------------------------------

function handleCorsPreflight(ctx: MiddlewareContext): NextResponse | null {
  if (ctx.method !== "OPTIONS" || !ctx.pathname.startsWith("/api/")) return null;

  const response = new NextResponse(null, { status: 204 });
  if (ctx.isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", ctx.origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

// ---------------------------------------------------------------------------
// Response: locale routing + all response-phase headers
// ---------------------------------------------------------------------------

function buildResponse(request: NextRequest, ctx: MiddlewareContext): NextResponse {
  let response: NextResponse;

  if (PASSTHROUGH_PREFIXES.some((p) => ctx.pathname.startsWith(p))) {
    response = NextResponse.next({
      request: {
        headers: new Headers({
          ...Object.fromEntries(request.headers),
          [CORRELATION_ID_HEADER]: ctx.correlationId,
        }),
      },
    });
  } else {
    response = intlMiddleware(request) as NextResponse;
  }

  response.headers.set(CORRELATION_ID_HEADER, ctx.correlationId);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.delete("X-Powered-By");

  if (ctx.pathname.startsWith("/api/v1/")) {
    response.headers.set("X-API-Version", "1");
  }

  if (ctx.isAllowedOrigin && ctx.origin) {
    response.headers.set("Access-Control-Allow-Origin", ctx.origin);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const ctx = await resolveContext(request);

  return (
    checkBodySize(request, ctx) ??
    applyRequestRateLimits({
      pathname: ctx.pathname,
      method: ctx.method,
      ip: ctx.ip,
      userId: ctx.userId,
      isAdmin: ctx.isAdmin,
      isE2eUser: ctx.isE2eUser,
    }) ??
    enforceAuth(request, ctx) ??
    handleCorsPreflight(ctx) ??
    buildResponse(request, ctx)
  );
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|manifest.json|icons/|sw.js).*)"],
};
