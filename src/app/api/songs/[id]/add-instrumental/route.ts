import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { addInstrumental } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { sanitizeText } from "@/lib/sanitize";
import { userFriendlyError } from "@/lib/generation";

const MAX_VARIATIONS = 5;

/** POST /api/songs/[id]/add-instrumental — generate instrumental backing for a vocal track */
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
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (parentSong.isInstrumental) {
      return NextResponse.json({ error: "Add instrumental is only available for vocal tracks.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const rootId = parentSong.parentSongId ?? parentId;

    const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, code: "RATE_LIMIT", resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json();

    let tags = (parentSong.tags || "").trim();
    if (body.tags !== undefined && body.tags !== null) {
      const { value, error } = sanitizeText(body.tags, "tags", 500);
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      tags = value;
    }

    if (!tags) {
      return NextResponse.json({ error: "Style tags are required for instrumental generation.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    let title: string | null = parentSong.title ? `${parentSong.title} (instrumental)` : null;
    if (body.title !== undefined && body.title !== null) {
      const { value, error } = sanitizeText(body.title, "title");
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      title = value || title;
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
        return NextResponse.json({ error: "Parent song has no audio URL to generate instrumental from.", code: "VALIDATION_ERROR" }, { status: 400 });
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
        const errorMsg = userFriendlyError(apiError, "Adding instrumental failed. Please try again.").message;
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
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
