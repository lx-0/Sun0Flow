import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { createMusicVideo } from "@/lib/sunoapi";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { userFriendlyError } from "@/lib/generation";

/** POST /api/songs/[id]/music-video — generate an MP4 music video */
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
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (song.generationStatus !== "ready") {
      return NextResponse.json({ error: "Song must be fully generated before creating a music video.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, code: "RATE_LIMIT", resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    let taskId: string | null = null;
    let status: "pending" | "ready" = "pending";

    if (!hasApiKey) {
      taskId = `mock-video-${songId}`;
      status = "ready";
    } else {
      if (!song.sunoJobId || !song.sunoAudioId) {
        return NextResponse.json({ error: "Song is missing Suno identifiers for music video generation.", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      try {
        const result = await createMusicVideo(
          { taskId: song.sunoJobId, audioId: song.sunoAudioId },
          userApiKey
        );
        taskId = result.taskId;
      } catch (apiError) {
        logServerError("music-video-api", apiError, { userId, route: `/api/songs/${songId}/music-video` });
        return NextResponse.json(
          { error: userFriendlyError(apiError, "Music video generation failed. Please try again.").message, rateLimit: rateLimitStatus },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { taskId, status, songId, format: "mp4", rateLimit: rateLimitStatus },
      { status: 200 }
    );
  } catch (error) {
    logServerError("music-video-route", error, { route: "/api/songs/music-video" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
