import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { fetchInstagramPost, isValidInstagramUrl } from "@/lib/instagram";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

const INSTAGRAM_RATE_LIMIT = 30;
const MINUTE_MS = 60_000;

export async function POST(req: NextRequest) {
  const { userId, isAdmin, error: authError } = await resolveUser(req);
  if (authError) return authError;

  if (!isAdmin) {
    const { acquired, status } = await acquireRateLimitSlot(userId, "instagram_fetch", INSTAGRAM_RATE_LIMIT, MINUTE_MS);
    if (!acquired) {
      return rateLimited(
        `Rate limit exceeded. You can fetch up to ${INSTAGRAM_RATE_LIMIT} Instagram requests per minute.`,
        { rateLimit: status }
      );
    }
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { urls } = body as { urls?: unknown };
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const validUrls = (urls as unknown[])
    .filter(
      (u): u is string => typeof u === "string" && isValidInstagramUrl(u)
    )
    .slice(0, 20);

  if (validUrls.length === 0) {
    return NextResponse.json(
      { error: "No valid Instagram URLs provided. Use post, reel, or IGTV links.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const posts = await Promise.all(validUrls.map(fetchInstagramPost));
  return NextResponse.json({ posts });
}
