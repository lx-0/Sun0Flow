import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSong } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Check rate limit before processing
    const { allowed, status: rateLimitStatus } = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        { status: 429 }
      );
    }

    const { prompt, title, tags, makeInstrumental } = await request.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A style/genre prompt is required" },
        { status: 400 }
      );
    }

    let sunoSongs;
    let usedMock = false;
    try {
      sunoSongs = await generateSong(prompt.trim(), {
        title: title?.trim() || undefined,
        tags: tags?.trim() || undefined,
        makeInstrumental: Boolean(makeInstrumental),
      });
    } catch {
      // Fall back to mock when SUNOAPI_KEY is not configured
      sunoSongs = mockSongs.slice(0, 1);
      usedMock = true;
    }

    // Persist each returned song to the DB
    const savedSongs = await Promise.all(
      sunoSongs.map((s) =>
        prisma.song.create({
          data: {
            userId,
            sunoJobId: usedMock ? null : s.id,
            title: s.title || title?.trim() || null,
            prompt: prompt.trim(),
            tags: s.tags || tags?.trim() || null,
            audioUrl: s.audioUrl || null,
            imageUrl: s.imageUrl || null,
            duration: s.duration ?? null,
            lyrics: s.lyrics || null,
            sunoModel: s.model || null,
            generationStatus:
              usedMock || s.status === "complete"
                ? "ready"
                : s.status === "error"
                  ? "failed"
                  : "pending",
          },
        })
      )
    );

    // Record rate limit hit after successful generation
    await recordRateLimitHit(userId);

    // Return updated rate limit status
    const { status: updatedRateLimit } = await checkRateLimit(userId);

    return NextResponse.json(
      { songs: savedSongs, rateLimit: updatedRateLimit },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
