import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

/** Map API errors to user-friendly messages without exposing internals */
function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429) return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 400) return "Invalid generation parameters. Please adjust your prompt and try again.";
    if (error.status === 401 || error.status === 403) return "API authentication failed. Please check your API key in settings.";
    if (error.status >= 500) return "The music generation service is temporarily unavailable. Please try again later.";
  }
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return "Could not reach the music generation service. Please check your connection and try again.";
  }
  return "Song generation failed. Please try again.";
}

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

    const generationParams = {
      prompt: prompt.trim(),
      title: title?.trim() || undefined,
      style: tags?.trim() || undefined,
      instrumental: Boolean(makeInstrumental),
    };

    const userApiKey = await resolveUserApiKey(userId);

    // If no API key at all (env or user), fall back to mock for demo mode
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    let savedSongs;
    if (!hasApiKey) {
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
    } else {
      try {
        const result = await generateSong(
          generationParams.prompt,
          {
            title: generationParams.title,
            style: generationParams.style,
            instrumental: generationParams.instrumental,
          },
          userApiKey
        );

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
      } catch (apiError) {
        logServerError("generate-api", apiError, {
          userId,
          route: "/api/generate",
          params: generationParams,
        });

        // Save a failed record so the user can see it in history and retry
        const errorMsg = userFriendlyError(apiError);
        const song = await prisma.song.create({
          data: {
            userId,
            title: title?.trim() || null,
            prompt: prompt.trim(),
            tags: tags?.trim() || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        savedSongs = [song];

        // Still record rate limit hit (the attempt was made)
        await recordRateLimitHit(userId);
        const { status: updatedRateLimit } = await checkRateLimit(userId);

        return NextResponse.json(
          { songs: savedSongs, error: errorMsg, rateLimit: updatedRateLimit },
          { status: 201 }
        );
      }
    }

    // Record rate limit hit after successful generation
    await recordRateLimitHit(userId);

    // Return updated rate limit status
    const { status: updatedRateLimit } = await checkRateLimit(userId);

    return NextResponse.json(
      { songs: savedSongs, rateLimit: updatedRateLimit },
      { status: 201 }
    );
  } catch (error) {
    logServerError("generate-route", error, {
      route: "/api/generate",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
