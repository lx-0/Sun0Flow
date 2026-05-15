import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { generateMidi, resolveUserApiKey } from "@/lib/sunoapi";
import { executeTransform, respondToTransform } from "@/lib/generation";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (song.generationStatus !== "ready") {
      return NextResponse.json({ error: "Song must be fully generated before extracting MIDI.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!song.sunoJobId || !song.sunoAudioId)) {
      return NextResponse.json({ error: "Song is missing Suno identifiers for MIDI extraction.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const outcome = await executeTransform({
      userId: auth.userId,
      action: "generate",
      apiCall: () => generateMidi(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId! },
        userApiKey,
      ),
      hasApiKey,
      mockTaskId: `mock-midi-${params.id}`,
      fallbackErrorMessage: "MIDI generation failed. Please try again.",
    });

    return respondToTransform(
      outcome,
      { label: "generate-midi-api", userId: auth.userId, route: `/api/songs/${params.id}/generate-midi` },
      { songId: params.id, format: "midi" },
    );
  },
  { route: "/api/songs/[id]/generate-midi" },
);
