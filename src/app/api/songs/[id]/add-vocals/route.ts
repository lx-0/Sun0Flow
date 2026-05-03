import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { addVocals } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { sanitizeText } from "@/lib/sanitize";
import { executeGeneration } from "@/lib/generation";

const MAX_VARIATIONS = 5;

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

    if (!parentSong.isInstrumental) {
      return NextResponse.json({ error: "Add vocals is only available for instrumental tracks.", code: "VALIDATION_ERROR" }, { status: 400 });
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

    const promptResult = sanitizeText(body.prompt, "prompt");
    if (!promptResult.value) {
      return NextResponse.json({ error: "A prompt describing the vocals is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (promptResult.error) {
      return NextResponse.json({ error: promptResult.error, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const prompt = promptResult.value;

    let style = parentSong.tags || "";
    if (body.style !== undefined && body.style !== null) {
      const { value, error } = sanitizeText(body.style, "style", 500);
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      style = value;
    }

    let title: string | null = parentSong.title ? `${parentSong.title} (with vocals)` : null;
    if (body.title !== undefined && body.title !== null) {
      const { value, error } = sanitizeText(body.title, "title");
      if (error) return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      title = value || title;
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && !parentSong.audioUrl) {
      return NextResponse.json({ error: "Parent song has no audio URL to add vocals to.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title: title || null,
        prompt,
        tags: style || null,
        isInstrumental: false,
        parentSongId: rootId,
      },
      hasApiKey,
      mockFallback: mockSongs[0],
      description: `Add vocals: ${title || "Untitled"}`,
      apiCall: () => addVocals(
        {
          uploadUrl: parentSong.audioUrl!,
          prompt,
          title: title || "Untitled",
          style: style || "pop",
        },
        userApiKey
      ),
    });

    if (outcome.status === "denied") return outcome.response;

    if (outcome.status === "failed") {
      logServerError("add-vocals-api", outcome.rawError, { userId, route: `/api/songs/${parentId}/add-vocals` });
      return NextResponse.json({ song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus }, { status: 201 });
    }

    return NextResponse.json({ song: outcome.song, rateLimit: outcome.rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("add-vocals-route", error, { route: "/api/songs/add-vocals" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
