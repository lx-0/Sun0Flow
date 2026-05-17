import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { proxyAudio } from "@/lib/audio";
import { publicRoute } from "@/lib/route-handler";

export const GET = publicRoute<{ songId: string }>(async (request, { params }) => {
  const { songId } = params;

  const song = await prisma.song.findFirst({
    where: { id: songId, isPublic: true, isHidden: false, archivedAt: null },
    select: {
      audioUrl: true,
      audioUrlExpiresAt: true,
      sunoJobId: true,
      sunoAudioId: true,
      userId: true,
    },
  });

  if (!song?.audioUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return proxyAudio({
    songId,
    audioUrl: song.audioUrl,
    audioUrlExpiresAt: song.audioUrlExpiresAt,
    sunoJobId: song.sunoJobId,
    sunoAudioId: song.sunoAudioId,
    resolveApiKey: () => resolveUserApiKey(song.userId),
    rangeHeader: request.headers.get("range"),
    cacheControl: "public",
  });
}, { route: "/api/audio/public/[songId]" });
