import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

const MAX_POLL_ATTEMPTS = 20;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song || song.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      return NextResponse.json({ song: updated });
    }

    // Check task status with Suno API
    const userApiKey = await resolveUserApiKey(session.user.id);
    let taskResult;
    try {
      taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
    } catch (pollError) {
      logServerError("status-poll", pollError, {
        userId: session.user.id,
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
      const firstSong = taskResult.songs[0];
      // Update the primary song record with the first result
      const updated = await prisma.song.update({
        where: { id },
        data: {
          generationStatus: "ready",
          audioUrl: firstSong.audioUrl || song.audioUrl,
          imageUrl: firstSong.imageUrl || song.imageUrl,
          duration: firstSong.duration ?? song.duration,
          lyrics: firstSong.lyrics || song.lyrics,
          title: firstSong.title || song.title,
          tags: firstSong.tags || song.tags,
          sunoModel: firstSong.model || song.sunoModel,
          pollCount: newPollCount,
        },
      });

      // If the API returned additional songs, create them as new records
      for (let i = 1; i < taskResult.songs.length; i++) {
        const extra = taskResult.songs[i];
        await prisma.song.create({
          data: {
            userId: song.userId,
            sunoJobId: extra.id || null,
            title: extra.title || song.title,
            prompt: song.prompt,
            tags: extra.tags || song.tags,
            audioUrl: extra.audioUrl || null,
            imageUrl: extra.imageUrl || null,
            duration: extra.duration ?? null,
            lyrics: extra.lyrics || null,
            sunoModel: extra.model || null,
            isInstrumental: song.isInstrumental,
            generationStatus: "ready",
          },
        });
      }

      return NextResponse.json({ song: updated });
    }

    if (isFailed) {
      const updated = await prisma.song.update({
        where: { id },
        data: {
          generationStatus: "failed",
          pollCount: newPollCount,
          errorMessage: taskResult.errorMessage || `Generation failed: ${taskResult.status}`,
        },
      });
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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
