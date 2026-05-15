import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { fetchFeed } from "@/lib/rss";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { badRequest, rateLimited } from "@/lib/api-error";

// Block SSRF by rejecting private/loopback/link-local IP ranges and
// non-HTTP(S) schemes. Only public HTTPS URLs are allowed.
function isSsrfUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true; // unparseable — block it
  }
  // Only allow http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;

  const hostname = url.hostname.toLowerCase();

  // Block localhost variants
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;

  // Block link-local / metadata service (169.254.0.0/16)
  if (/^169\.254\./.test(hostname)) return true;

  // Block RFC-1918 private ranges
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  )
    return true;

  // Block IPv6 private/loopback
  if (/^(::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/.test(hostname)) return true;

  return false;
}

const RSS_RATE_LIMIT = 20;
const MINUTE_MS = 60_000;

const fetchFeedsBody = z.object({
  urls: z.array(z.string()).min(1, "urls array required"),
});

export const POST = authRoute(async (_req, { auth, body }) => {
  const { userId, isAdmin } = auth;

  if (!isAdmin) {
    const { acquired, status } = await acquireRateLimitSlot(userId, "rss_fetch", RSS_RATE_LIMIT, MINUTE_MS);
    if (!acquired) {
      return rateLimited(
        `Rate limit exceeded. You can fetch up to ${RSS_RATE_LIMIT} RSS requests per minute.`,
        { rateLimit: status }
      );
    }
  }
  const validUrls = body.urls
    .filter(
      (u) =>
        (u.startsWith("http://") || u.startsWith("https://")) &&
        !isSsrfUrl(u)
    )
    .slice(0, 10);

  if (validUrls.length === 0) {
    return badRequest("No valid URLs provided");
  }

  const feeds = await Promise.all(validUrls.map(fetchFeed));
  return NextResponse.json({ feeds });
}, { route: "/api/rss/fetch", body: fetchFeedsBody });
