import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { proxyAudio } from "@/lib/audio";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> },
) {
  try {
    const { songId } = await params;

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
  } catch (err) {
    logger.error({ err }, "public audio proxy: unhandled error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
