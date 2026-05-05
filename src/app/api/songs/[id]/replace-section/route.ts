import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { replaceSection } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { executeGeneration } from "@/lib/generation";

const MAX_VARIATIONS = 5;
const MIN_SECTION_S = 6;
const MAX_SECTION_S = 60;
const MAX_SECTION_RATIO = 0.5;

/** POST /api/songs/[id]/replace-section — replace a time section within a song */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;
    const { id: songId } = await params;

    const parentSong = await prisma.song.findUnique({ where: { id: songId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const rootId = parentSong.parentSongId ?? songId;

    const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const prompt = (body.prompt ?? "").trim();
    const tags = (body.tags ?? parentSong.tags ?? "").trim();
    const title = (body.title ?? "").trim() || (parentSong.title ? `${parentSong.title} (section replaced)` : null);
    const infillStartS = typeof body.infillStartS === "number" ? body.infillStartS : null;
    const infillEndS = typeof body.infillEndS === "number" ? body.infillEndS : null;
    const negativeTags = body.negativeTags?.trim() || undefined;

    if (infillStartS == null || infillEndS == null) {
      return NextResponse.json({ error: "Start and end times are required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (infillStartS < 0 || infillEndS <= infillStartS) {
      return NextResponse.json({ error: "Invalid time range. End must be after start.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const sectionLen = infillEndS - infillStartS;
    if (sectionLen < MIN_SECTION_S) {
      return NextResponse.json({ error: `Section must be at least ${MIN_SECTION_S} seconds.`, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (sectionLen > MAX_SECTION_S) {
      return NextResponse.json({ error: `Section must be at most ${MAX_SECTION_S} seconds.`, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (parentSong.duration && sectionLen > parentSong.duration * MAX_SECTION_RATIO) {
      return NextResponse.json({ error: "Section must be at most 50% of the song duration.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "A replacement prompt is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!tags) {
      return NextResponse.json({ error: "Style tags are required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!parentSong.sunoJobId || !parentSong.sunoAudioId)) {
      return NextResponse.json({ error: "Cannot replace section on a song without Suno identifiers.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const mock = mockSongs[0];
    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title,
        prompt,
        tags,
        isInstrumental: parentSong.isInstrumental,
        parentSongId: rootId,
      },
      apiCall: () => replaceSection(
        {
          taskId: parentSong.sunoJobId!,
          audioId: parentSong.sunoAudioId!,
          prompt,
          tags,
          title: title || parentSong.title || "Untitled",
          infillStartS: infillStartS!,
          infillEndS: infillEndS!,
          negativeTags,
        },
        userApiKey
      ),
      mockFallback: {
        title: mock.title,
        tags: mock.tags,
        audioUrl: mock.audioUrl,
        imageUrl: mock.imageUrl,
        duration: mock.duration,
        lyrics: mock.lyrics,
        model: mock.model,
      },
      hasApiKey,
      description: "replace-section",
      skipCreditCheck: true,
      skipCreditRecording: true,
    });

    if (outcome.status === "denied") return outcome.response;
    if (outcome.status === "failed") {
      logServerError("replace-section-api", outcome.rawError, { userId, route: `/api/songs/${songId}/replace-section` });
      return NextResponse.json({ song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus }, { status: 201 });
    }
    return NextResponse.json({ song: outcome.song, rateLimit: outcome.rateLimitStatus }, { status: 201 });
  } catch (error) {
    logServerError("replace-section-route", error, { route: "/api/songs/replace-section" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
