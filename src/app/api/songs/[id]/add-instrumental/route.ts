import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addInstrumental } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { sanitizeText } from "@/lib/sanitize";
import { executeGeneration } from "@/lib/generation";

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

    if (hasApiKey && !parentSong.audioUrl) {
      return NextResponse.json({ error: "Parent song has no audio URL to generate instrumental from.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const mock = mockSongs[0];
    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title,
        prompt: parentSong.prompt || "",
        tags,
        isInstrumental: true,
        parentSongId: rootId,
      },
      apiCall: () => addInstrumental(
        { uploadUrl: parentSong.audioUrl!, title: title || "Untitled", tags },
        userApiKey
      ),
      mockFallback: {
        title: mock.title,
        tags: mock.tags,
        audioUrl: mock.audioUrl,
        imageUrl: mock.imageUrl,
        duration: mock.duration,
        model: mock.model,
      },
      hasApiKey,
      description: "add-instrumental",
      skipCreditCheck: true,
      skipCreditRecording: true,
    });

    if (outcome.status === "denied") return outcome.response;
    if (outcome.status === "failed") {
      logServerError("add-instrumental-api", outcome.rawError, { userId, route: `/api/songs/${parentId}/add-instrumental` });
      return NextResponse.json({ song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus }, { status: 201 });
    }
    return NextResponse.json({ song: outcome.song, rateLimit: outcome.rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("add-instrumental-route", error, { route: "/api/songs/add-instrumental" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
