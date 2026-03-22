import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extendMusic, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

const MAX_VARIATIONS = 5;

function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429) return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 400) return "Invalid parameters. Please adjust your settings and try again.";
    if (error.status === 401 || error.status === 403) return "API authentication failed. Please check your API key in settings.";
    if (error.status >= 500) return "The music generation service is temporarily unavailable. Please try again later.";
  }
  return "Song extension failed. Please try again.";
}

/** POST /api/songs/[id]/extend — extend a song with continuation */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id: parentId } = await params;

    const parentSong = await prisma.song.findUnique({ where: { id: parentId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rootId = parentSong.parentSongId ?? parentId;

    const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.` },
        { status: 400 }
      );
    }

    const { allowed, status: rateLimitStatus } = await checkRateLimit(userId);
    if (!allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json();
    const prompt = (body.prompt?.trim() || parentSong.prompt || "").trim();
    const style = (body.style?.trim() || parentSong.tags || "").trim() || undefined;
    const title = body.title?.trim() || (parentSong.title ? `${parentSong.title} (extended)` : null);
    const continueAt = typeof body.continueAt === "number" ? body.continueAt : undefined;

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    let savedSong;
    if (!hasApiKey) {
      const mock = mockSongs[0];
      savedSong = await prisma.song.create({
        data: {
          userId,
          parentSongId: rootId,
          title: title || mock.title || null,
          prompt,
          tags: style || mock.tags || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: parentSong.isInstrumental,
          generationStatus: "ready",
        },
      });
    } else {
      if (!parentSong.sunoJobId) {
        return NextResponse.json({ error: "Cannot extend a song without a Suno audio ID." }, { status: 400 });
      }
      try {
        const result = await extendMusic(
          {
            audioId: parentSong.sunoJobId,
            defaultParamFlag: !!(prompt || style || title || continueAt),
            prompt: prompt || undefined,
            style,
            title: title || undefined,
            continueAt,
          },
          userApiKey
        );

        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            sunoJobId: result.taskId,
            title: title || null,
            prompt,
            tags: style || null,
            isInstrumental: parentSong.isInstrumental,
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        logServerError("extend-api", apiError, { userId, route: `/api/songs/${parentId}/extend` });
        const errorMsg = userFriendlyError(apiError);
        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            title: title || null,
            prompt,
            tags: style || null,
            isInstrumental: parentSong.isInstrumental,
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        await recordRateLimitHit(userId);
        const { status: updatedRateLimit } = await checkRateLimit(userId);
        return NextResponse.json({ song: savedSong, error: errorMsg, rateLimit: updatedRateLimit }, { status: 201 });
      }
    }

    await recordRateLimitHit(userId);
    const { status: updatedRateLimit } = await checkRateLimit(userId);
    return NextResponse.json({ song: savedSong, rateLimit: updatedRateLimit }, { status: 201 });
  } catch (error) {
    logServerError("extend-route", error, { route: "/api/songs/extend" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
