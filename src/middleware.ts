import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ---------------------------------------------------------------------------
// Rate Limit Thresholds (per IP, sliding window)
// ---------------------------------------------------------------------------
// Bucket        | Max Requests | Window   | Applies To
// ------------- | ------------ | -------- | ---------------------------------
// "public"      | 30           | 1 minute | /s/* (public share pages)
// "auth"        | 10           | 1 minute | /api/register, forgot/reset password
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const ipHits = new Map<string, Map<string, number[]>>();

function checkIpRateLimit(ip: string, bucket: string, max: number): boolean {
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

  return hits.length <= max;
}

function checkPublicRateLimit(ip: string): boolean {
  return checkIpRateLimit(ip, "public", 30);
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/api/auth", "/api/register", "/api/health", "/api/agent-skill", "/s/"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? "unknown";

  // Rate limit public share pages
  if (pathname.startsWith("/s/")) {
    if (!checkPublicRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  // Rate limit auth endpoints: 10 requests per minute per IP
  if (pathname === "/api/register" || pathname === "/api/auth/forgot-password" || pathname === "/api/auth/reset-password") {
    if (!checkIpRateLimit(ip, "auth", 10)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }
  }

  // Allow API requests with a Bearer sk-... API key through without session
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json).*)"],
};
