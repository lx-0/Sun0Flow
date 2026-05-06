import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { broadcast } from "@/lib/event-bus";
import { handleSongSuccess, handleSongFailure } from "@/lib/song-completion";

const MAX_POLL_ATTEMPTS = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Already terminal — return as-is
    if (song.generationStatus === "ready" || song.generationStatus === "failed") {
      return NextResponse.json({ song });
    }

    // No sunoJobId (taskId) to poll — treat as failed
    if (!song.sunoJobId) {
      const updated = await prisma.song.update({
        where: { id },
        data: { generationStatus: "failed", errorMessage: "No Suno task ID" },
      });
      broadcast(song.userId, {
        type: "generation_update",
        data: { songId: id, status: "failed", errorMessage: updated.errorMessage },
      });
      return NextResponse.json({ song: updated });
    }

    const newPollCount = song.pollCount + 1;

    // Exceeded max attempts without completing — mark failed
    if (newPollCount > MAX_POLL_ATTEMPTS) {
      const updated = await prisma.song.update({
        where: { id },
        data: {
          generationStatus: "failed",
          pollCount: newPollCount,
          errorMessage: "Generation timed out",
        },
      });
      broadcast(song.userId, {
        type: "generation_update",
        data: { songId: id, status: "failed", errorMessage: "Generation timed out" },
      });
      await prisma.generationQueueItem.updateMany({
        where: { songId: id, status: "processing" },
        data: { status: "failed", errorMessage: "Generation timed out" },
      });
      broadcast(song.userId, { type: "queue_item_complete", data: { songId: id } });
      return NextResponse.json({ song: updated });
    }

    // Check task status with Suno API
    const userApiKey = await resolveUserApiKey(userId);
    let taskResult;
    try {
      taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
    } catch (pollError) {
      logServerError("status-poll", pollError, {
        userId: userId,
        route: `/api/songs/${id}/status`,
        params: { songId: id, sunoJobId: song.sunoJobId, pollCount: newPollCount },
      });
      // Transient error — increment poll count but don't fail yet
      const updated = await prisma.song.update({
        where: { id },
        data: { pollCount: newPollCount },
      });
      return NextResponse.json({ song: updated });
    }

    const isComplete = taskResult.status === "SUCCESS";
    const isFailed =
      taskResult.status === "CREATE_TASK_FAILED" ||
      taskResult.status === "GENERATE_AUDIO_FAILED" ||
      taskResult.status === "CALLBACK_EXCEPTION" ||
      taskResult.status === "SENSITIVE_WORD_ERROR";

    if (isComplete && taskResult.songs.length > 0) {
      await handleSongSuccess(song, taskResult.songs);
      const updated = await prisma.song.findUnique({ where: { id } });
      return NextResponse.json({ song: updated });
    }

    if (isFailed) {
      const errorMessage = taskResult.errorMessage || `Generation failed: ${taskResult.status}`;
      await handleSongFailure(song, errorMessage);
      const updated = await prisma.song.findUnique({ where: { id } });
      return NextResponse.json({ song: updated });
    }

    // Still pending — update poll count
    const updated = await prisma.song.update({
      where: { id },
      data: { pollCount: newPollCount },
    });
    return NextResponse.json({ song: updated });
  } catch (error) {
    logServerError("status-route", error, {
      route: "/api/songs/status",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
