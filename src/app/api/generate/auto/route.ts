import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/llm";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";

const MAX_REFERENCE_SONGS = 3;

const SYSTEM_PROMPT = `You are a creative music generator. Given a description or prompt, generate:
1. A catchy song title (short, 2-6 words)
2. A music style/genre description (comma-separated tags, 3-8 words, e.g. "dreamy indie pop, ethereal vocals, reverb guitar")
3. A lyrics prompt (a vivid 1-2 sentence description of the song's theme and mood, used to generate lyrics)

Respond ONLY with valid JSON in this exact format:
{"title": "...", "style": "...", "lyricsPrompt": "..."}

Consider the user's musical taste if reference songs are provided. Be creative and specific.`;

const generateAutoBodySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "A description prompt is required")
    .max(1000, "Prompt must be 1000 characters or less"),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  try {
    if (!auth.isAdmin) {
      const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(
        auth.userId,
        "lyrics_generate"
      );
      if (!acquired) {
        const resetAt = new Date(rateLimitStatus.resetAt);
        const retryAfterSec = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
        logger.warn({ userId: auth.userId, action: "lyrics_generate", limit: rateLimitStatus.limit, resetAt: rateLimitStatus.resetAt }, "rate-limit: lyrics_generate limit exceeded");
        Sentry.addBreadcrumb({
          category: "rate-limit",
          message: "Lyrics generate rate limit exceeded",
          level: "warning",
          data: { userId: auth.userId, action: "lyrics_generate", limit: rateLimitStatus.limit, resetAt: rateLimitStatus.resetAt },
        });
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMIT", resetAt: rateLimitStatus.resetAt },
          { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } }
        );
      }
    }

    const favoriteSongs = await prisma.song.findMany({
      where: {
        userId: auth.userId,
        favorites: { some: { userId: auth.userId } },
      },
      orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
      take: MAX_REFERENCE_SONGS,
      select: { title: true, tags: true },
    });

    let userPrompt = `Description: ${body.prompt}`;

    if (favoriteSongs.length > 0) {
      const refContext = favoriteSongs
        .map((s) => `"${s.title ?? "Untitled"}"${s.tags ? ` (${s.tags})` : ""}`)
        .join(", ");
      userPrompt += `\n\nUser's favorite songs for style reference: ${refContext}`;
    }

    const raw = await generateText(SYSTEM_PROMPT, userPrompt);

    if (!raw) {
      return NextResponse.json(
        { error: "Generation failed. Please try again.", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }

    let result: { title: string; style: string; lyricsPrompt: string };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return NextResponse.json(
        { error: "Generation returned unexpected format. Please try again.", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      title: result.title ?? "",
      style: result.style ?? "",
      lyricsPrompt: result.lyricsPrompt ?? "",
    });
  } catch (error) {
    logServerError("generate-auto", error, { route: "/api/generate/auto", userId: auth.userId });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}, { body: generateAutoBodySchema, route: "/api/generate/auto" });
