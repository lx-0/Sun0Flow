import { prisma } from "@/lib/prisma";
import { getTaskStatus, isTerminalFailure } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { handleSongSuccess, handleSongFailure } from "@/lib/song-completion";
import type { SongRecord } from "@/lib/song-completion";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 60;

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

function buildSongRecord(target: CompletionTarget, pollCount: number): SongRecord {
  return {
    id: target.songId,
    userId: target.userId,
    prompt: target.existingSong.prompt,
    tags: target.existingSong.tags,
    audioUrl: target.existingSong.audioUrl,
    audioUrlExpiresAt: null,
    imageUrl: target.existingSong.imageUrl,
    imageUrlExpiresAt: null,
    duration: target.existingSong.duration,
    lyrics: target.existingSong.lyrics,
    title: target.existingSong.title,
    sunoModel: target.existingSong.sunoModel,
    isInstrumental: target.existingSong.isInstrumental,
    pollCount,
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
      const songRecord = buildSongRecord(target, pollCount - 1);
      await handleSongFailure(songRecord, "Generation timed out");
      yield { songId: target.songId, status: "failed", errorMessage: "Generation timed out" };
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
      const songRecord = buildSongRecord(target, pollCount - 1);
      await handleSongSuccess(songRecord, taskResult.songs);
      const firstSong = taskResult.songs[0];
      yield {
        songId: target.songId,
        status: "ready",
        title: firstSong.title || target.existingSong.title,
        audioUrl: firstSong.audioUrl || target.existingSong.audioUrl,
        imageUrl: firstSong.imageUrl || target.existingSong.imageUrl,
        alternateCount: taskResult.songs.length - 1,
      };
      return;
    }

    if (isTerminalFailure(taskResult.status)) {
      const errorMessage = taskResult.errorMessage || `Generation failed: ${taskResult.status}`;
      const songRecord = buildSongRecord(target, pollCount - 1);
      await handleSongFailure(songRecord, errorMessage);
      yield { songId: target.songId, status: "failed", errorMessage };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
