import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";
import { sendGenerationCompleteEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { recordActivity } from "@/lib/activity";
import crypto from "crypto";

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
      const firstSong = taskResult.songs[0];
      // Audio URLs expire in 15 days (generated); use 12 days as a conservative buffer.
      const audioUrlExpiresAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
      // Update the primary song record with the first result
      const updated = await prisma.song.update({
        where: { id },
        data: {
          generationStatus: "ready",
          audioUrl: firstSong.audioUrl || song.audioUrl,
          audioUrlExpiresAt: firstSong.audioUrl ? audioUrlExpiresAt : song.audioUrlExpiresAt,
          imageUrl: firstSong.imageUrl || song.imageUrl,
          duration: firstSong.duration ?? song.duration,
          lyrics: firstSong.lyrics || song.lyrics,
          title: firstSong.title || song.title,
          tags: firstSong.tags || song.tags,
          sunoModel: firstSong.model || song.sunoModel,
          pollCount: newPollCount,
        },
      });

      // If the API returned additional songs, create them as linked alternates
      for (let i = 1; i < taskResult.songs.length; i++) {
        const extra = taskResult.songs[i];
        const alternateSong = await prisma.song.create({
          data: {
            userId: song.userId,
            sunoJobId: extra.id || null,
            title: extra.title || song.title,
            prompt: song.prompt,
            tags: extra.tags || song.tags,
            audioUrl: extra.audioUrl || null,
            audioUrlExpiresAt: extra.audioUrl ? audioUrlExpiresAt : null,
            imageUrl: extra.imageUrl || null,
            duration: extra.duration ?? null,
            lyrics: extra.lyrics || null,
            sunoModel: extra.model || null,
            isInstrumental: song.isInstrumental,
            generationStatus: "ready",
            parentSongId: id,
          },
        });
        broadcast(song.userId, {
          type: "generation_update",
          data: {
            songId: alternateSong.id,
            parentSongId: id,
            status: "ready",
            title: alternateSong.title,
            audioUrl: alternateSong.audioUrl,
            imageUrl: alternateSong.imageUrl,
          },
        });
      }

      const alternateCount = taskResult.songs.length - 1;
      invalidateByPrefix(`dashboard-stats:${song.userId}`);
      broadcast(song.userId, {
        type: "generation_update",
        data: { songId: id, status: "ready", title: updated.title, audioUrl: updated.audioUrl, imageUrl: updated.imageUrl, alternateCount },
      });

      // Record activity for the primary song
      recordActivity({ userId: song.userId, type: "song_created", songId: id });

      // Update linked queue item
      await prisma.generationQueueItem.updateMany({
        where: { songId: id, status: "processing" },
        data: { status: "done" },
      });
      // Signal client to process next item
      broadcast(song.userId, { type: "queue_item_complete", data: { songId: id } });

      // Send generation complete email if user has opted in
      const userPrefs = await prisma.user.findUnique({
        where: { id: song.userId },
        select: { email: true, emailGenerationComplete: true, unsubscribeToken: true },
      });
      if (userPrefs?.email && userPrefs.emailGenerationComplete) {
        let unsubToken = userPrefs.unsubscribeToken;
        if (!unsubToken) {
          unsubToken = crypto.randomUUID();
          await prisma.user.update({ where: { id: song.userId }, data: { unsubscribeToken: unsubToken } });
        }
        sendGenerationCompleteEmail(userPrefs.email, { id, title: updated.title }, unsubToken).catch((err) =>
          logger.error({ userId: song.userId, songId: id, err }, "status: failed to send generation complete email")
        );
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
      broadcast(song.userId, {
        type: "generation_update",
        data: { songId: id, status: "failed", errorMessage: updated.errorMessage },
      });

      // Update linked queue item and signal next
      await prisma.generationQueueItem.updateMany({
        where: { songId: id, status: "processing" },
        data: { status: "failed", errorMessage: updated.errorMessage },
      });
      broadcast(song.userId, { type: "queue_item_complete", data: { songId: id } });

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
