import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateMidi } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { executeTransform } from "@/lib/generation";

/** POST /api/songs/[id]/generate-midi — extract MIDI from a track */
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
      return NextResponse.json({ error: "Song must be fully generated before extracting MIDI.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!song.sunoJobId || !song.sunoAudioId)) {
      return NextResponse.json({ error: "Song is missing Suno identifiers for MIDI extraction.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const outcome = await executeTransform({
      userId,
      action: "generate",
      apiCall: () => generateMidi(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId! },
        userApiKey
      ),
      hasApiKey,
      mockTaskId: `mock-midi-${songId}`,
      fallbackErrorMessage: "MIDI generation failed. Please try again.",
    });

    if (outcome.status === "denied") return outcome.response;
    if (outcome.status === "failed") {
      logServerError("generate-midi-api", outcome.rawError, { userId, route: `/api/songs/${songId}/generate-midi` });
      return NextResponse.json(
        { error: outcome.error, rateLimit: outcome.rateLimitStatus },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { taskId: outcome.taskId, status: outcome.mockMode ? "ready" : "pending", songId, format: "midi", rateLimit: outcome.rateLimitStatus },
      { status: 200 }
    );
  } catch (error) {
    logServerError("generate-midi-route", error, { route: "/api/songs/generate-midi" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
