import { prisma } from "@/lib/prisma";
import { getTaskStatus, isTerminalFailure } from "@/lib/sunoapi";
import type { SunoSong } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { handleSongSuccess, handleSongFailure } from "@/lib/song-completion";
import type { SongRecord } from "@/lib/song-completion";

const POLL_INTERVAL_MS = 4000;
export const MAX_POLL_ATTEMPTS = 60;

// ── Single-poll interpretation ─────────────────────────────────────

export type PollOutcome =
  | { kind: "ready"; songs: SunoSong[] }
  | { kind: "failed"; errorMessage: string }
  | { kind: "processing" }
  | { kind: "poll_error"; error: unknown };

export async function pollOnce(
  sunoJobId: string,
  apiKey: string | undefined,
): Promise<PollOutcome> {
  let taskResult;
  try {
    taskResult = await getTaskStatus(sunoJobId, apiKey);
  } catch (error) {
    return { kind: "poll_error", error };
  }

  if (taskResult.status === "SUCCESS" && taskResult.songs.length > 0) {
    return { kind: "ready", songs: taskResult.songs };
  }

  if (isTerminalFailure(taskResult.status)) {
    const errorMessage = taskResult.errorMessage || `Generation failed: ${taskResult.status}`;
    return { kind: "failed", errorMessage };
  }

  return { kind: "processing" };
}

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

    const outcome = await pollOnce(target.sunoJobId, target.apiKey);

    switch (outcome.kind) {
      case "ready": {
        const songRecord = buildSongRecord(target, pollCount - 1);
        await handleSongSuccess(songRecord, outcome.songs);
        const firstSong = outcome.songs[0];
        yield {
          songId: target.songId,
          status: "ready",
          title: firstSong.title || target.existingSong.title,
          audioUrl: firstSong.audioUrl || target.existingSong.audioUrl,
          imageUrl: firstSong.imageUrl || target.existingSong.imageUrl,
          alternateCount: outcome.songs.length - 1,
        };
        return;
      }
      case "failed": {
        const songRecord = buildSongRecord(target, pollCount - 1);
        await handleSongFailure(songRecord, outcome.errorMessage);
        yield { songId: target.songId, status: "failed", errorMessage: outcome.errorMessage };
        return;
      }
      case "poll_error": {
        logServerError("generation-poll", outcome.error, {
          userId: target.userId,
          route: "generation/completion",
          params: { songId: target.songId, sunoJobId: target.sunoJobId, pollCount },
        });
        await prisma.song.update({ where: { id: target.songId }, data: { pollCount } });
        yield { songId: target.songId, status: "processing", pollCount };
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      case "processing": {
        await prisma.song.update({ where: { id: target.songId }, data: { pollCount } });
        yield { songId: target.songId, status: "processing", pollCount };
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
