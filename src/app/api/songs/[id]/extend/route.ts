import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extendMusic } from "@/lib/sunoapi";
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

    const rootId = parentSong.parentSongId ?? parentId;

    const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const body = await request.json();

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

    if (hasApiKey && !parentSong.sunoAudioId) {
      return NextResponse.json({ error: "Cannot extend a song without a Suno audio ID.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const outcome = await executeGeneration({
      userId,
      action: "extend",
      songParams: {
        title: title || null,
        prompt,
        tags: style || null,
        isInstrumental: parentSong.isInstrumental,
        parentSongId: rootId,
      },
      hasApiKey,
      mockFallback: mockSongs[0],
      description: `Music extension: ${title || "Untitled"}`,
      apiCall: () => extendMusic(
        {
          audioId: parentSong.sunoAudioId!,
          defaultParamFlag: !!(prompt || style || title || continueAt),
          prompt: prompt || undefined,
          style,
          title: title || undefined,
          continueAt,
        },
        userApiKey
      ),
    });

    if (outcome.status === "denied") return outcome.response;

    if (outcome.status === "failed") {
      logServerError("extend-api", outcome.rawError, { userId, route: `/api/songs/${parentId}/extend` });
      return NextResponse.json({ song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus }, { status: 201 });
    }

    return NextResponse.json({ song: outcome.song, rateLimit: outcome.rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("extend-route", error, { route: "/api/songs/extend" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
