import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { fetchInstagramPost, isValidInstagramUrl } from "@/lib/instagram";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

const INSTAGRAM_RATE_LIMIT = 30;
const MINUTE_MS = 60_000;

const instagramFetchBodySchema = z.object({
  urls: z.array(z.unknown()),
});

export const POST = authRoute(
  async (_req, { auth, body }) => {
    if (!auth.isAdmin) {
      const { acquired, status } = await acquireRateLimitSlot(
        auth.userId,
        "instagram_fetch",
        INSTAGRAM_RATE_LIMIT,
        MINUTE_MS,
      );
      if (!acquired) {
        return rateLimited(
          `Rate limit exceeded. You can fetch up to ${INSTAGRAM_RATE_LIMIT} Instagram requests per minute.`,
          { rateLimit: status },
        );
      }
    }

    const validUrls = body.urls
    .filter(
      (u): u is string => typeof u === "string" && isValidInstagramUrl(u)
    )
    .slice(0, 20);

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No valid Instagram URLs provided. Use post, reel, or IGTV links.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const posts = await Promise.all(validUrls.map(fetchInstagramPost));
    return NextResponse.json({ posts });
  },
  {
    route: "/api/instagram/fetch",
    body: instagramFetchBodySchema,
    query: undefined,
  },
);
