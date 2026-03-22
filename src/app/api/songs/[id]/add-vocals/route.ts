import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { addVocals, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
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
  return "Adding vocals failed. Please try again.";
}

/** POST /api/songs/[id]/add-vocals — add vocals over an instrumental track */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;
    const { id: parentId } = await params;

    const parentSong = await prisma.song.findUnique({ where: { id: parentId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!parentSong.isInstrumental) {
      return NextResponse.json({ error: "Add vocals is only available for instrumental tracks." }, { status: 400 });
    }

    const rootId = parentSong.parentSongId ?? parentId;

    const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.` },
        { status: 400 }
      );
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
    const prompt = body.prompt?.trim();
    const style = body.style?.trim() || parentSong.tags || "";
    const title = body.title?.trim() || (parentSong.title ? `${parentSong.title} (with vocals)` : null);

    if (!prompt) {
      return NextResponse.json({ error: "A prompt describing the vocals is required." }, { status: 400 });
    }

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
          isInstrumental: false,
          generationStatus: "ready",
        },
      });
    } else {
      if (!parentSong.audioUrl) {
        return NextResponse.json({ error: "Parent song has no audio URL to add vocals to." }, { status: 400 });
      }
      try {
        const result = await addVocals(
          {
            uploadUrl: parentSong.audioUrl,
            prompt,
            title: title || "Untitled",
            style: style || "pop",
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
            isInstrumental: false,
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        logServerError("add-vocals-api", apiError, { userId, route: `/api/songs/${parentId}/add-vocals` });
        const errorMsg = userFriendlyError(apiError);
        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            title: title || null,
            prompt,
            tags: style || null,
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
    logServerError("add-vocals-route", error, { route: "/api/songs/add-vocals" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
