import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { SUNO_WEBHOOK_SECRET } from "@/lib/env";
import { mapRawSong, taskStatusToSongStatus, isTerminalFailure } from "@/lib/sunoapi/mappers";
import { handleSongSuccess, handleSongFailure } from "@/lib/generation";
import { parseSunoWebhookRequest } from "@/lib/webhooks/suno-request";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await parseSunoWebhookRequest(req, { secret: SUNO_WEBHOOK_SECRET });
  if (!parsed.ok) {
    return parsed.response;
  }

  const { payload, taskId, status } = parsed;
  logger.info({ taskId, status }, "suno-webhook: received callback");

  const song = await prisma.song.findUnique({ where: { sunoJobId: taskId } });
  if (!song) {
    logger.warn({ taskId }, "suno-webhook: no song found for taskId");
    return NextResponse.json({ received: true, matched: false });
  }

  if (song.generationStatus === "ready" || song.generationStatus === "failed") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const isComplete = status === "SUCCESS";
  const isFailed = isTerminalFailure(status);

  try {
    if (isComplete) {
      const rawSongs = payload.data?.response?.sunoData ?? [];
      const songs = rawSongs.map((raw) => {
        const mapped = mapRawSong(raw);
        mapped.status = taskStatusToSongStatus(status);
        return mapped;
      });
      await handleSongSuccess(song, songs);
    } else if (isFailed) {
      const errorMessage = payload.data?.errorMessage || `Generation failed: ${status}`;
      await handleSongFailure(song, errorMessage);
    }
  } catch (err) {
    logger.error({ err, taskId, songId: song.id }, "suno-webhook: error processing callback");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
