import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { separateVocals, SunoApiError } from "@/lib/sunoapi";
import type { SeparationType } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429) return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 400) return "Invalid parameters. Please adjust your settings and try again.";
    if (error.status === 401 || error.status === 403) return "API authentication failed. Please check your API key in settings.";
    if (error.status >= 500) return "The music generation service is temporarily unavailable. Please try again later.";
  }
  return "Vocal separation failed. Please try again.";
}

/** POST /api/songs/[id]/separate-vocals — separate vocals/instruments from a track */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;
    const { id: songId } = await params;

    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (song.generationStatus !== "ready") {
      return NextResponse.json({ error: "Song must be fully generated before separating vocals." }, { status: 400 });
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json();
    const separationType: SeparationType = body.type === "split_stem" ? "split_stem" : "separate_vocal";

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    let savedSong;
    if (!hasApiKey) {
      // Mock mode: create fake stem results
      const mock = mockSongs[0];
      savedSong = await prisma.song.create({
        data: {
          userId,
          parentSongId: songId,
          title: `${song.title || "Untitled"} (${separationType === "split_stem" ? "stems" : "vocals"})`,
          prompt: `Vocal separation of "${song.title || "Untitled"}"`,
          tags: song.tags,
          audioUrl: mock.audioUrl || null,
          imageUrl: song.imageUrl,
          duration: song.duration,
          sunoModel: song.sunoModel,
          isInstrumental: false,
          generationStatus: "ready",
        },
      });
    } else {
      if (!song.sunoJobId) {
        return NextResponse.json({ error: "Song has no Suno task ID for vocal separation." }, { status: 400 });
      }

      try {
        const result = await separateVocals(
          {
            taskId: song.sunoJobId,
            audioId: song.sunoJobId,
            type: separationType,
          },
          userApiKey
        );

        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: songId,
            sunoJobId: result.taskId,
            title: `${song.title || "Untitled"} (${separationType === "split_stem" ? "stems" : "vocals"})`,
            prompt: `Vocal separation of "${song.title || "Untitled"}"`,
            tags: song.tags,
            isInstrumental: false,
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        logServerError("separate-vocals-api", apiError, { userId, route: `/api/songs/${songId}/separate-vocals` });
        const errorMsg = userFriendlyError(apiError);
        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: songId,
            title: `${song.title || "Untitled"} (vocals)`,
            prompt: `Vocal separation of "${song.title || "Untitled"}"`,
            tags: song.tags,
            isInstrumental: false,
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        return NextResponse.json({ song: savedSong, error: errorMsg, rateLimit: rateLimitStatus }, { status: 201 });
      }
    }

    return NextResponse.json({ song: savedSong, rateLimit: rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("separate-vocals-route", error, { route: "/api/songs/separate-vocals" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
