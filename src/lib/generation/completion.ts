import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 60;

const TERMINAL_FAILURE_STATUSES = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
]);

export interface CompletionUpdate {
  songId: string;
  status: "processing" | "ready" | "failed";
  title?: string | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  errorMessage?: string | null;
  pollCount?: number;
  alternateCount?: number;
  parentSongId?: string;
}

export interface CompletionTarget {
  songId: string;
  userId: string;
  sunoJobId: string;
  apiKey: string | undefined;
  currentPollCount: number;
  existingSong: {
    title: string | null;
    prompt: string | null;
    tags: string | null;
    audioUrl: string | null;
    imageUrl: string | null;
    duration: number | null;
    lyrics: string | null;
    sunoModel: string | null;
    isInstrumental: boolean;
  };
}

export async function* pollToCompletion(
  target: CompletionTarget,
  signal?: AbortSignal,
): AsyncGenerator<CompletionUpdate> {
  let pollCount = target.currentPollCount;

  while (!signal?.aborted) {
    pollCount += 1;

    if (pollCount > MAX_POLL_ATTEMPTS) {
      const updated = await prisma.song.update({
        where: { id: target.songId },
        data: {
          generationStatus: "failed",
          pollCount,
          errorMessage: "Generation timed out",
        },
      });
      broadcast(target.userId, {
        type: "generation_update",
        data: { songId: target.songId, status: "failed", errorMessage: updated.errorMessage },
      });
      yield { songId: target.songId, status: "failed", errorMessage: updated.errorMessage };
      return;
    }

    let taskResult;
    try {
      taskResult = await getTaskStatus(target.sunoJobId, target.apiKey);
    } catch (pollError) {
      logServerError("generation-poll", pollError, {
        userId: target.userId,
        route: "generation/completion",
        params: { songId: target.songId, sunoJobId: target.sunoJobId, pollCount },
      });
      await prisma.song.update({
        where: { id: target.songId },
        data: { pollCount },
      });
      yield { songId: target.songId, status: "processing", pollCount };
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (taskResult.status === "SUCCESS" && taskResult.songs.length > 0) {
      yield* handleSuccess(target, taskResult, pollCount);
      return;
    }

    if (TERMINAL_FAILURE_STATUSES.has(taskResult.status)) {
      yield* handleFailure(target, taskResult, pollCount);
      return;
    }

    await prisma.song.update({
      where: { id: target.songId },
      data: { pollCount },
    });
    yield { songId: target.songId, status: "processing", pollCount };
    await sleep(POLL_INTERVAL_MS);
  }
}

async function* handleSuccess(
  target: CompletionTarget,
  taskResult: { songs: Array<{ title?: string; audioUrl?: string; imageUrl?: string; duration?: number; lyrics?: string; tags?: string; model?: string; id?: string }> },
  pollCount: number,
): AsyncGenerator<CompletionUpdate> {
  const firstSong = taskResult.songs[0];
  const existing = target.existingSong;

  const updated = await prisma.song.update({
    where: { id: target.songId },
    data: {
      generationStatus: "ready",
      audioUrl: firstSong.audioUrl || existing.audioUrl,
      imageUrl: firstSong.imageUrl || existing.imageUrl,
      duration: firstSong.duration ?? existing.duration,
      lyrics: firstSong.lyrics || existing.lyrics,
      title: firstSong.title || existing.title,
      tags: firstSong.tags || existing.tags,
      sunoModel: firstSong.model || existing.sunoModel,
      pollCount,
    },
  });

  for (let i = 1; i < taskResult.songs.length; i++) {
    const extra = taskResult.songs[i];
    const alternateSong = await prisma.song.create({
      data: {
        userId: target.userId,
        sunoJobId: extra.id || null,
        title: extra.title || existing.title,
        prompt: existing.prompt ?? "",
        tags: extra.tags || existing.tags,
        audioUrl: extra.audioUrl || null,
        imageUrl: extra.imageUrl || null,
        duration: extra.duration ?? null,
        lyrics: extra.lyrics || null,
        sunoModel: extra.model || null,
        isInstrumental: existing.isInstrumental,
        generationStatus: "ready",
        parentSongId: target.songId,
      },
    });
    broadcast(target.userId, {
      type: "generation_update",
      data: {
        songId: alternateSong.id,
        parentSongId: target.songId,
        status: "ready",
        title: alternateSong.title,
        audioUrl: alternateSong.audioUrl,
        imageUrl: alternateSong.imageUrl,
      },
    });
  }

  const alternateCount = taskResult.songs.length - 1;
  invalidateByPrefix(`dashboard-stats:${target.userId}`);

  const eventData: CompletionUpdate = {
    songId: target.songId,
    status: "ready",
    title: updated.title,
    audioUrl: updated.audioUrl,
    imageUrl: updated.imageUrl,
    alternateCount,
  };
  broadcast(target.userId, { type: "generation_update", data: { ...eventData } });
  yield eventData;
}

async function* handleFailure(
  target: CompletionTarget,
  taskResult: { status: string; errorMessage?: string | null },
  pollCount: number,
): AsyncGenerator<CompletionUpdate> {
  const updated = await prisma.song.update({
    where: { id: target.songId },
    data: {
      generationStatus: "failed",
      pollCount,
      errorMessage: taskResult.errorMessage || `Generation failed: ${taskResult.status}`,
    },
  });
  const eventData: CompletionUpdate = {
    songId: target.songId,
    status: "failed",
    errorMessage: updated.errorMessage,
  };
  broadcast(target.userId, { type: "generation_update", data: { ...eventData } });
  yield eventData;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
