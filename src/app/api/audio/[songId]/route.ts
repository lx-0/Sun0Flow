import { NextRequest } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { proxyAudio } from "@/lib/audio";
import { notFound } from "@/lib/api-error";

export const GET = authRoute<{ songId: string }>(
  async (request: NextRequest, { auth, params }) => {
    const { songId } = params;

    const song = await prisma.song.findFirst({
      where: { id: songId, userId: auth.userId },
      select: {
        audioUrl: true,
        audioUrlExpiresAt: true,
        sunoJobId: true,
        sunoAudioId: true,
      },
    });

    if (!song?.audioUrl) {
      return notFound("Not found");
    }

    return proxyAudio({
      songId,
      audioUrl: song.audioUrl,
      audioUrlExpiresAt: song.audioUrlExpiresAt,
      sunoJobId: song.sunoJobId,
      sunoAudioId: song.sunoAudioId,
      resolveApiKey: () => resolveUserApiKey(auth.userId),
      rangeHeader: request.headers.get("range"),
      cacheControl: "private",
    });
  },
  { route: "/api/audio/[songId]" },
);
