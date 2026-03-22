import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

const MAX_VARIATIONS = 5;

function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429) return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 400) return "Invalid generation parameters. Please adjust your prompt and try again.";
    if (error.status === 401 || error.status === 403) return "API authentication failed. Please check your API key in settings.";
    if (error.status >= 500) return "The music generation service is temporarily unavailable. Please try again later.";
  }
  return "Song generation failed. Please try again.";
}

/** GET /api/songs/[id]/variations — list variations for a song */
export async function GET(
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

    // Find the root song (walk up the parent chain)
    let rootId = id;
    if (song.parentSongId) {
      // This song is itself a variation — find the root
      let current = song;
      while (current.parentSongId) {
        const parent = await prisma.song.findUnique({ where: { id: current.parentSongId } });
        if (!parent) break;
        current = parent;
      }
      rootId = current.id;
    }

    // Fetch the root song and all its direct variations
    const root = rootId === id ? song : await prisma.song.findUnique({ where: { id: rootId } });
    const variations = await prisma.song.findMany({
      where: { parentSongId: rootId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        prompt: true,
        tags: true,
        audioUrl: true,
        imageUrl: true,
        duration: true,
        lyrics: true,
        generationStatus: true,
        isInstrumental: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      root: root ? {
        id: root.id,
        title: root.title,
        prompt: root.prompt,
        tags: root.tags,
        audioUrl: root.audioUrl,
        imageUrl: root.imageUrl,
        duration: root.duration,
        lyrics: root.lyrics,
        generationStatus: root.generationStatus,
        isInstrumental: root.isInstrumental,
        createdAt: root.createdAt,
      } : null,
      variations,
      variationCount: variations.length,
      maxVariations: MAX_VARIATIONS,
    });
  } catch (error) {
    logServerError("variations-list", error, { route: "/api/songs/variations" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/songs/[id]/variations — create a variation of a song */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;
    const { id: parentId } = await params;

    // Verify parent song exists and belongs to user
    const parentSong = await prisma.song.findUnique({ where: { id: parentId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Find the root song for variation counting
    const rootId = parentSong.parentSongId ?? parentId;

    // Check variation limit
    const variationCount = await prisma.song.count({
      where: { parentSongId: rootId },
    });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.` },
        { status: 400 }
      );
    }

    // Check rate limit
    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000)
      );
      return NextResponse.json(
        { error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, resetAt: rateLimitStatus.resetAt, rateLimit: rateLimitStatus },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    // Parse body — allow overrides for prompt, tags, title
    const body = await request.json();
    const prompt = (body.prompt?.trim() || parentSong.prompt || "").trim();
    const tags = (body.tags?.trim() || parentSong.tags || "").trim() || null;
    const title = body.title?.trim() || (parentSong.title ? `${parentSong.title} (variation)` : null);
    const makeInstrumental = body.makeInstrumental ?? parentSong.isInstrumental;

    if (!prompt) {
      return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    let savedSong;
    if (!hasApiKey) {
      // Mock mode
      const mock = mockSongs[0];
      savedSong = await prisma.song.create({
        data: {
          userId,
          parentSongId: rootId,
          title: mock.title || title || null,
          prompt,
          tags: mock.tags || tags || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: Boolean(makeInstrumental),
          generationStatus: "ready",
        },
      });
    } else {
      try {
        const result = await generateSong(
          prompt,
          { title: title || undefined, style: tags || undefined, instrumental: Boolean(makeInstrumental) },
          userApiKey
        );

        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            sunoJobId: result.taskId,
            title: title || null,
            prompt,
            tags: tags || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        logServerError("variation-api", apiError, { userId, route: `/api/songs/${parentId}/variations` });

        const errorMsg = userFriendlyError(apiError);
        savedSong = await prisma.song.create({
          data: {
            userId,
            parentSongId: rootId,
            title: title || null,
            prompt,
            tags: tags || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        return NextResponse.json(
          { song: savedSong, error: errorMsg, rateLimit: rateLimitStatus },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(
      { song: savedSong, rateLimit: rateLimitStatus },
      { status: 201 }
    );
  } catch (error) {
    logServerError("variation-route", error, { route: "/api/songs/variations" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
