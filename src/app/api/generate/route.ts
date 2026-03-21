import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSong } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";

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

    const userApiKey = await resolveUserApiKey(userId);

    let savedSongs;
    try {
      const result = await generateSong(
        prompt.trim(),
        {
          title: title?.trim() || undefined,
          style: tags?.trim() || undefined,
          instrumental: Boolean(makeInstrumental),
        },
        userApiKey
      );

      // Create a pending song record with the taskId
      const song = await prisma.song.create({
        data: {
          userId,
          sunoJobId: result.taskId,
          title: title?.trim() || null,
          prompt: prompt.trim(),
          tags: tags?.trim() || null,
          isInstrumental: Boolean(makeInstrumental),
          generationStatus: "pending",
        },
      });

      savedSongs = [song];
    } catch {
      // Fall back to mock when no API key or API call fails
      const mock = mockSongs[0];
      const song = await prisma.song.create({
        data: {
          userId,
          title: mock.title || title?.trim() || null,
          prompt: prompt.trim(),
          tags: mock.tags || tags?.trim() || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: Boolean(makeInstrumental),
          generationStatus: "ready",
        },
      });
      savedSongs = [song];
    }

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
