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
  // Media proxies — the route handlers enforce their own auth/visibility checks
  // (authRoute / publicRoute). Without bypassing the edge redirect here, the
  // <audio>/<img> element follows the 307 to /login HTML and treats the HTML
  // as the media stream — silent breakage on share pages and after a JWT-cookie
  // eviction in iOS PWAs.
  "/api/audio/", "/api/images/",
  "/s/", "/p/", "/u/", "/songs/", "/embed/",
];

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

const PASSTHROUGH_PREFIXES = ["/api/", "/s/", "/p/", "/u/", "/songs/", "/embed/"];

const localePrefixes = routing.locales
  .map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const localePrefixPattern = localePrefixes.length > 0
  ? new RegExp(`^/(?:${localePrefixes})(?=/|$)`)
  : null;

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
  if (!localePrefixPattern) return pathname || "/";
  return pathname.replace(localePrefixPattern, "") || "/";
}

function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function resolveContext(request: NextRequest): Promise<MiddlewareContext> {
  const secureCookie = process.env.AUTH_URL?.startsWith("https://") ?? false;
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req: request, secret: authSecret, secureCookie });
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
// Concern: strip leaked upstream port from self-redirects
//
// Behind a reverse proxy (Railway, Vercel, etc.) the public origin is
// terminated at the edge on port 443, but the container listens on an
// arbitrary internal port (e.g. $PORT=8080). Next.js builds absolute redirect
// URLs from req.headers.host, which can include that internal port. The
// browser then follows the Location to a port the edge does not expose →
// connection refused → white screen.
//
// Detection of "behind a proxy" is purely header-based (x-forwarded-host).
// In local dev no such header is set, so we leave Location untouched and
// localhost:3000 redirects keep working.
// ---------------------------------------------------------------------------

function getCanonicalOrigin(
  request: NextRequest,
): { host: string; proto: string } | null {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (!fwdHost) return null;
  const proto = (request.headers.get("x-forwarded-proto") ?? "https")
    .split(",")[0]
    .trim();
  const host = fwdHost.split(",")[0].trim().split(":")[0];
  if (!host) return null;
  return { host, proto };
}

function normalizeRedirectLocation(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const location = response.headers.get("location");
  if (!location) return response;

  const canonical = getCanonicalOrigin(request);
  if (!canonical) return response;

  let url: URL;
  try {
    url = new URL(location, `${canonical.proto}://${canonical.host}`);
  } catch {
    return response;
  }

  const isSelfHost =
    url.hostname === canonical.host ||
    url.hostname === request.nextUrl.hostname;
  if (!isSelfHost) return response;

  url.protocol = `${canonical.proto}:`;
  url.host = canonical.host;
  url.port = "";

  response.headers.set("location", url.toString());
  return response;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const ctx = await resolveContext(request);

  const response =
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
    buildResponse(request, ctx);

  return normalizeRedirectLocation(response, request);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|manifest.json|icons/|sw.js).*)"],
};
