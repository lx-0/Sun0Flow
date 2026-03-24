import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/llm";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logServerError } from "@/lib/error-logger";

const MAX_REFERENCE_SONGS = 3;

const SYSTEM_PROMPT = `You are a creative music generator. Given a description or prompt, generate:
1. A catchy song title (short, 2-6 words)
2. A music style/genre description (comma-separated tags, 3-8 words, e.g. "dreamy indie pop, ethereal vocals, reverb guitar")
3. A lyrics prompt (a vivid 1-2 sentence description of the song's theme and mood, used to generate lyrics)

Respond ONLY with valid JSON in this exact format:
{"title": "...", "style": "...", "lyricsPrompt": "..."}

Consider the user's musical taste if reference songs are provided. Be creative and specific.`;

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A description prompt is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: "Prompt must be 1000 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(
      userId,
      "lyrics_generate"
    );
    if (!acquired) {
      const resetAt = new Date(rateLimitStatus.resetAt);
      const retryAfterSec = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMIT", resetAt: rateLimitStatus.resetAt },
        { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } }
      );
    }

    // Fetch reference songs for personalization
    const favoriteSongs = await prisma.song.findMany({
      where: {
        userId,
        favorites: { some: { userId } },
      },
      orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
      take: MAX_REFERENCE_SONGS,
      select: { title: true, tags: true },
    });

    let userPrompt = `Description: ${prompt.trim()}`;

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

    // Parse the JSON response
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
    logServerError("generate-auto", error, { route: "/api/generate/auto" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
