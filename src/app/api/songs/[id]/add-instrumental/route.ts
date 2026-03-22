import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addInstrumental, SunoApiError } from "@/lib/sunoapi";
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
  return "Adding instrumental failed. Please try again.";
}

/** POST /api/songs/[id]/add-instrumental — generate instrumental backing for a vocal track */
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

    if (parentSong.isInstrumental) {
      return NextResponse.json({ error: "Add instrumental is only available for vocal tracks." }, { status: 400 });
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
    const tags = (body.tags?.trim() || parentSong.tags || "").trim();
    const title = body.title?.trim() || (parentSong.title ? `${parentSong.title} (instrumental)` : null);

    if (!tags) {
      return NextResponse.json({ error: "Style tags are required for instrumental generation." }, { status: 400 });
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
          prompt: parentSong.prompt || null,
          tags: tags || mock.tags || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          sunoModel: mock.model || null,
          isInstrumental: true,
          generationStatus: "ready",
        },
      });
    } else {
      if (!parentSong.audioUrl) {
        return NextResponse.json({ error: "Parent song has no audio URL to generate instrumental from." }, { status: 400 });
      }
      try {
        const result = await addInstrumental(
          {
            uploadUrl: parentSong.audioUrl,
            title: title || "Untitled",
            tags,
          },
          userApiKey
        );

        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            sunoJobId: result.taskId,
            title: title || null,
            prompt: parentSong.prompt || null,
            tags,
            isInstrumental: true,
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        logServerError("add-instrumental-api", apiError, { userId, route: `/api/songs/${parentId}/add-instrumental` });
        const errorMsg = userFriendlyError(apiError);
        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            title: title || null,
            prompt: parentSong.prompt || null,
            tags,
            isInstrumental: true,
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        return NextResponse.json({ song: savedSong, error: errorMsg, rateLimit: rateLimitStatus }, { status: 201 });
      }
    }

    return NextResponse.json({ song: savedSong, rateLimit: rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("add-instrumental-route", error, { route: "/api/songs/add-instrumental" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
