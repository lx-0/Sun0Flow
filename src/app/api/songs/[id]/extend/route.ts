import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { extendMusic, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { sanitizeText } from "@/lib/sanitize";

const MAX_VARIATIONS = 5;

function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 402) return "Insufficient credits. Please check your balance or top up to continue.";
    if (error.status === 409) return "A conflicting request is already in progress. Please wait and try again.";
    if (error.status === 422) return `Validation error: ${error.message}`;
    if (error.status === 429) return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 451) return "This request was blocked for compliance reasons. Please modify your prompt and try again.";
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
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;
    const { id: parentId } = await params;

    const parentSong = await prisma.song.findUnique({ where: { id: parentId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
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

    // Validate and sanitize user-supplied text fields
    let prompt = (parentSong.prompt || "").trim();
    if (body.prompt !== undefined && body.prompt !== null) {
      const { value, error } = sanitizeText(body.prompt, "prompt");
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      prompt = value || prompt;
    }

    let style: string | undefined = (parentSong.tags || "").trim() || undefined;
    if (body.style !== undefined && body.style !== null) {
      const { value, error } = sanitizeText(body.style, "style", 500);
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      style = value || undefined;
    }

    let title: string | null = parentSong.title ? `${parentSong.title} (extended)` : null;
    if (body.title !== undefined && body.title !== null) {
      const { value, error } = sanitizeText(body.title, "title");
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      title = value || title;
    }

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
      if (!parentSong.sunoAudioId) {
        return NextResponse.json({ error: "Cannot extend a song without a Suno audio ID.", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      try {
        const result = await extendMusic(
          {
            audioId: parentSong.sunoAudioId,
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

        return NextResponse.json({ song: savedSong, error: errorMsg, rateLimit: rateLimitStatus }, { status: 201 });
      }
    }

    return NextResponse.json({ song: savedSong, rateLimit: rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("extend-route", error, { route: "/api/songs/extend" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
