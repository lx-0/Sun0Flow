import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { separateVocals } from "@/lib/sunoapi";
import type { SeparationType } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { executeGeneration } from "@/lib/generation";

/** POST /api/songs/[id]/separate-vocals — separate vocals/instruments from a track */
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
      return NextResponse.json({ error: "Song must be fully generated before separating vocals.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const body = await request.json();
    const separationType: SeparationType = body.type === "split_stem" ? "split_stem" : "separate_vocal";

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!song.sunoJobId || !song.sunoAudioId)) {
      return NextResponse.json({ error: "Song is missing Suno identifiers for vocal separation.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const suffix = separationType === "split_stem" ? "stems" : "vocals";
    const title = `${song.title || "Untitled"} (${suffix})`;
    const mock = mockSongs[0];

    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title,
        prompt: `Vocal separation of "${song.title || "Untitled"}"`,
        tags: song.tags,
        isInstrumental: false,
        parentSongId: songId,
      },
      apiCall: () => separateVocals(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId!, type: separationType },
        userApiKey
      ),
      mockFallback: {
        audioUrl: mock.audioUrl,
        imageUrl: song.imageUrl,
        duration: song.duration,
        model: song.sunoModel,
      },
      hasApiKey,
      description: "separate-vocals",
      skipCreditCheck: true,
      skipCreditRecording: true,
    });

    if (outcome.status === "denied") return outcome.response;
    if (outcome.status === "failed") {
      logServerError("separate-vocals-api", outcome.rawError, { userId, route: `/api/songs/${songId}/separate-vocals` });
      return NextResponse.json({ song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus }, { status: 201 });
    }
    return NextResponse.json({ song: outcome.song, rateLimit: outcome.rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("separate-vocals-route", error, { route: "/api/songs/separate-vocals" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
