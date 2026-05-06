import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/llm";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logServerError } from "@/lib/error-logger";

const SYSTEM_PROMPT =
  "Generate original song lyrics inspired by the style of the reference lyrics. " +
  "Never copy — create new original content. " +
  "Match the mood and style but with fresh words and ideas.";

const MAX_REFERENCE_SONGS = 5;

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A lyrics prompt is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: "Prompt must be 2000 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Rate limit: 10 generations per hour per user
    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(
      userId,
      "lyrics_generate"
    );
    if (!acquired) {
      const resetAt = new Date(rateLimitStatus.resetAt);
      const retryAfterSec = Math.ceil(
        (resetAt.getTime() - Date.now()) / 1000
      );
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMIT",
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
        }
      );
    }

    // Auto-select reference songs: favorites first (by rating desc, download count),
    // then fall back to any rated songs
    const favoriteSongs = await prisma.song.findMany({
      where: {
        userId,
        favorites: { some: { userId } },
        lyrics: { not: null },
      },
      orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
      take: MAX_REFERENCE_SONGS,
      select: { id: true, title: true, lyrics: true },
    });

    let referenceSongs = favoriteSongs;

    if (referenceSongs.length < MAX_REFERENCE_SONGS) {
      const existingIds = referenceSongs.map((s) => s.id);
      const ratedSongs = await prisma.song.findMany({
        where: {
          userId,
          rating: { not: null },
          lyrics: { not: null },
          id: { notIn: existingIds },
        },
        orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
        take: MAX_REFERENCE_SONGS - referenceSongs.length,
        select: { id: true, title: true, lyrics: true },
      });
      referenceSongs = [...referenceSongs, ...ratedSongs];
    }

    // Build user prompt with reference context
    let userPrompt: string;

    if (referenceSongs.length > 0) {
      const referenceContext = referenceSongs
        .map(
          (s, i) =>
            `--- Reference ${i + 1}: "${s.title ?? "Untitled"}" ---\n${s.lyrics}`
        )
        .join("\n\n");

      userPrompt = `Theme/mood/topic: ${prompt.trim()}\n\nReference lyrics for style inspiration:\n\n${referenceContext}`;
    } else {
      // No reference songs — generate freeform
      userPrompt = `Theme/mood/topic: ${prompt.trim()}`;
    }

    const lyrics = await generateText(SYSTEM_PROMPT, userPrompt);

    if (!lyrics) {
      return NextResponse.json(
        { error: "Lyrics generation failed. Please try again.", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      lyrics,
      referenceSongs: referenceSongs.map((s) => ({
        id: s.id,
        title: s.title,
      })),
    });
  } catch (error) {
    logServerError("lyrics-generate", error, {
      route: "/api/lyrics/generate",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
