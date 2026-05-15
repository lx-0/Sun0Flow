import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { separateVocals, mockSongs, resolveUserApiKey } from "@/lib/sunoapi";
import type { SeparationType } from "@/lib/sunoapi";
import { executeGeneration, respondToGeneration } from "@/lib/generation";

export const POST = authRoute<{ id: string }>(
  async (request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (song.generationStatus !== "ready") {
      return NextResponse.json({ error: "Song must be fully generated before separating vocals.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const body = await request.json();
    const separationType: SeparationType = body.type === "split_stem" ? "split_stem" : "separate_vocal";

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!song.sunoJobId || !song.sunoAudioId)) {
      return NextResponse.json({ error: "Song is missing Suno identifiers for vocal separation.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const suffix = separationType === "split_stem" ? "stems" : "vocals";
    const title = `${song.title || "Untitled"} (${suffix})`;
    const mock = mockSongs[0];

    const outcome = await executeGeneration({
      userId: auth.userId,
      action: "generate",
      songParams: {
        title,
        prompt: `Vocal separation of "${song.title || "Untitled"}"`,
        tags: song.tags,
        isInstrumental: false,
        parentSongId: params.id,
      },
      apiCall: () => separateVocals(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId!, type: separationType },
        userApiKey,
      ),
      mockFallback: {
        audioUrl: mock.audioUrl,
        imageUrl: song.imageUrl,
        duration: song.duration,
        model: song.sunoModel,
      },
      hasApiKey,
      guards: "free",
      description: "separate-vocals",
    });

    return respondToGeneration(outcome, { label: "separate-vocals-api", userId: auth.userId, route: `/api/songs/${params.id}/separate-vocals` });
  },
  { route: "/api/songs/[id]/separate-vocals" },
);
