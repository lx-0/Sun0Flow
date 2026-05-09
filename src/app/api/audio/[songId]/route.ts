import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { proxyAudio } from "@/lib/audio";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> },
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { songId } = await params;

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: {
        audioUrl: true,
        audioUrlExpiresAt: true,
        sunoJobId: true,
        sunoAudioId: true,
      },
    });

    if (!song?.audioUrl) {
      return NextResponse.json(
        {
          error: "Not found",
          code: "NOT_FOUND",
          detail: { hasJobId: !!song?.sunoJobId },
        },
        { status: 404 },
      );
    }

    return proxyAudio({
      songId,
      audioUrl: song.audioUrl,
      audioUrlExpiresAt: song.audioUrlExpiresAt,
      sunoJobId: song.sunoJobId,
      sunoAudioId: song.sunoAudioId,
      resolveApiKey: () => resolveUserApiKey(userId),
      rangeHeader: request.headers.get("range"),
      cacheControl: "private",
    });
  } catch (err) {
    logger.error({ err }, "audio proxy: unhandled error");
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
