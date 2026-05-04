import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { SUNO_WEBHOOK_SECRET } from "@/lib/env";
import { mapRawSong, taskStatusToSongStatus } from "@/lib/sunoapi/mappers";
import { handleSongSuccess, handleSongFailure } from "@/lib/song-completion";
import type { TaskStatus } from "@/lib/sunoapi/types";

export const dynamic = "force-dynamic";

interface WebhookPayload {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    status?: TaskStatus;
    errorMessage?: string | null;
    response?: {
      sunoData?: Record<string, unknown>[];
    };
  };
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!SUNO_WEBHOOK_SECRET || token !== SUNO_WEBHOOK_SECRET) {
    logger.warn({ hasToken: !!token }, "suno-webhook: invalid or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = payload.data?.taskId;
  const status = payload.data?.status;

  if (!taskId || !status) {
    logger.warn({ payload }, "suno-webhook: missing taskId or status");
    return NextResponse.json({ error: "Missing taskId or status" }, { status: 400 });
  }

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
  const isFailed =
    status === "CREATE_TASK_FAILED" ||
    status === "GENERATE_AUDIO_FAILED" ||
    status === "CALLBACK_EXCEPTION" ||
    status === "SENSITIVE_WORD_ERROR";

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
