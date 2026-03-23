import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { SUNOAPI_KEY } from "@/lib/env";

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

/** POST /api/songs/[id]/retry — retry a failed song in-place */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (song.generationStatus !== "failed") {
      return NextResponse.json(
        { error: "Only failed songs can be retried" },
        { status: 400 }
      );
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    let updatedSong;
    if (!hasApiKey) {
      const mock = mockSongs[0];
      updatedSong = await prisma.song.update({
        where: { id },
        data: {
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          generationStatus: "ready",
          errorMessage: null,
          pollCount: 0,
        },
      });
    } else {
      try {
        const result = await generateSong(
          song.prompt ?? "",
          {
            title: song.title ?? undefined,
            style: song.tags ?? undefined,
            instrumental: song.isInstrumental,
          },
          userApiKey
        );

        updatedSong = await prisma.song.update({
          where: { id },
          data: {
            sunoJobId: result.taskId,
            generationStatus: "pending",
            errorMessage: null,
            pollCount: 0,
            audioUrl: null,
            imageUrl: null,
            duration: null,
            lyrics: null,
            sunoModel: null,
          },
        });
      } catch (apiError) {
        logServerError("retry-api", apiError, {
          userId,
          route: `/api/songs/${id}/retry`,
          songId: id,
        });

        const errorMsg = userFriendlyError(apiError);
        updatedSong = await prisma.song.update({
          where: { id },
          data: {
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        return NextResponse.json(
          { song: updatedSong, error: errorMsg, rateLimit: rateLimitStatus },
          { status: 201 }
        );
      }
    }

    return NextResponse.json({ song: updatedSong, rateLimit: rateLimitStatus }, { status: 200 });
  } catch (error) {
    logServerError("retry-route", error, { route: "/api/songs/[id]/retry" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
