import type { Song } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { handleSongFailure, handleSongSuccess } from "@/lib/generation";
import { mapRawSong, taskStatusToSongStatus, isTerminalFailure } from "@/lib/sunoapi/mappers";
import type { TaskStatus } from "@/lib/sunoapi/types";
import type { SunoWebhookPayload } from "./suno-request";

interface SunoWebhookHandlerDeps {
  findSongByTaskId: (taskId: string) => Promise<Song | null>;
  handleSongSuccess: typeof handleSongSuccess;
  handleSongFailure: typeof handleSongFailure;
}

function isTerminalGenerationStatus(status: Song["generationStatus"]) {
  return status === "ready" || status === "failed";
}

export interface SunoWebhookProcessInput {
  payload: SunoWebhookPayload;
  taskId: string;
  status: TaskStatus;
}

export interface SunoWebhookProcessResult {
  kind: "processed" | "duplicate" | "not_found";
}

const defaultDeps: SunoWebhookHandlerDeps = {
  findSongByTaskId: (taskId) => prisma.song.findUnique({ where: { sunoJobId: taskId } }),
  handleSongSuccess,
  handleSongFailure,
};

export async function processSunoWebhook(
  input: SunoWebhookProcessInput,
  deps: SunoWebhookHandlerDeps = defaultDeps,
): Promise<SunoWebhookProcessResult> {
  const { payload, taskId, status } = input;
  logger.info({ taskId, status }, "suno-webhook: received callback");

  const song = await deps.findSongByTaskId(taskId);
  if (!song) {
    logger.warn({ taskId }, "suno-webhook: no song found for taskId");
    return { kind: "not_found" };
  }

  if (isTerminalGenerationStatus(song.generationStatus)) {
    logger.info({ songId: song.id, status: song.generationStatus }, "suno-webhook: ignoring callback for terminal song");
    return { kind: "duplicate" };
  }

  if (status === "SUCCESS") {
    const rawSongs = payload.data?.response?.sunoData ?? [];
    const songs = rawSongs.map((raw) => {
      const mapped = mapRawSong(raw);
      mapped.status = taskStatusToSongStatus(status);
      return mapped;
    });
    await deps.handleSongSuccess(song, songs);
    return { kind: "processed" };
  }

  if (isTerminalFailure(status)) {
    const errorMessage = payload.data?.errorMessage || `Generation failed: ${status}`;
    await deps.handleSongFailure(song, errorMessage);
    return { kind: "processed" };
  }

  return { kind: "processed" };
}
