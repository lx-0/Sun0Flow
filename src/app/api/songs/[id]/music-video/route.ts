import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { createMusicVideo, resolveUserApiKey } from "@/lib/sunoapi";
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
      return NextResponse.json({ error: "Song must be fully generated before creating a music video.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (hasApiKey && (!song.sunoJobId || !song.sunoAudioId)) {
      return NextResponse.json({ error: "Song is missing Suno identifiers for music video generation.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const outcome = await executeTransform({
      userId: auth.userId,
      action: "generate",
      apiCall: () => createMusicVideo(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId! },
        userApiKey,
      ),
      hasApiKey,
      mockTaskId: `mock-video-${params.id}`,
      fallbackErrorMessage: "Music video generation failed. Please try again.",
    });

    return respondToTransform(
      outcome,
      { label: "music-video-api", userId: auth.userId, route: `/api/songs/${params.id}/music-video` },
      { songId: params.id, format: "mp4" },
    );
  },
  { route: "/api/songs/[id]/music-video" },
);
