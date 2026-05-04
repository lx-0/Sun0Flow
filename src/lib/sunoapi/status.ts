import type {
  TaskStatus,
  TaskStatusResult,
  SunoSong,
} from "./types";
import { SunoApiError } from "./errors";
import { BASE_URL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { mapRawSong, taskStatusToSongStatus } from "./mappers";

export async function getTaskStatus(
  taskId: string,
  apiKey?: string
): Promise<TaskStatusResult> {
  const res = await fetchWithRetry(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET", headers: buildHeaders(apiKey) }
  );

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: {
      taskId?: string;
      status?: TaskStatus;
      errorMessage?: string | null;
      operationType?: string;
      response?: {
        sunoData?: Record<string, unknown>[];
      };
    };
  };

  const data = json.data;
  if (!data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No data in task status response");
  }

  const status = data.status ?? "PENDING";
  const rawSongs = data.response?.sunoData ?? [];
  const songs: SunoSong[] = rawSongs.map((raw) => {
    const song = mapRawSong(raw);
    song.status = taskStatusToSongStatus(status);
    return song;
  });

  return {
    taskId: data.taskId ?? taskId,
    status,
    songs,
    errorMessage: data.errorMessage,
    operationType: data.operationType,
  };
}

export async function getRemainingCredits(apiKey?: string): Promise<number> {
  const res = await fetchWithRetry(`${BASE_URL}/generate/credit`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const json = (await res.json()) as { code?: number; msg?: string; data?: number };

  if (json.data == null) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No credit data returned");
  }

  return json.data;
}
