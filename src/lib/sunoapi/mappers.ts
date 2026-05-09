import type { StyleTuningOptions, SunoSong, SongStatus, TaskStatus } from "./types";
import { SunoApiError } from "./errors";

export async function extractTaskId(res: Response, context: string): Promise<string> {
  const json = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
  if (!json.data?.taskId) {
    throw new SunoApiError(500, `No taskId returned from ${context}`);
  }
  return json.data.taskId;
}

export function applyStyleTuning(body: Record<string, unknown>, opts: StyleTuningOptions): void {
  if (opts.personaId != null) body.personaId = opts.personaId;
  if (opts.personaModel != null) body.personaModel = opts.personaModel;
  if (opts.negativeTags != null) body.negativeTags = opts.negativeTags;
  if (opts.vocalGender != null) body.vocalGender = opts.vocalGender;
  if (opts.styleWeight != null) body.styleWeight = opts.styleWeight;
  if (opts.weirdnessConstraint != null) body.weirdnessConstraint = opts.weirdnessConstraint;
  if (opts.audioWeight != null) body.audioWeight = opts.audioWeight;
}

export function mapRawSong(raw: Record<string, unknown>): SunoSong {
  return {
    id: (raw.id as string) ?? "",
    title: (raw.title as string) ?? "",
    prompt: (raw.prompt as string) ?? "",
    tags: (raw.tags as string) ?? undefined,
    audioUrl: (raw.audio_url as string) ?? (raw.audioUrl as string) ?? "",
    streamAudioUrl: (raw.stream_audio_url as string) ?? (raw.streamAudioUrl as string) ?? undefined,
    imageUrl: (raw.image_url as string) ?? (raw.imageUrl as string) ?? undefined,
    duration: (raw.duration as number) ?? undefined,
    status: "pending",
    model: (raw.model_name as string) ?? (raw.modelName as string) ?? undefined,
    lyrics: (raw.prompt as string) ?? undefined,
    createdAt: (raw.createTime as string) ?? (raw.createdAt as string) ?? new Date().toISOString(),
  };
}

export function taskStatusToSongStatus(status: TaskStatus): SongStatus {
  if (status === "SUCCESS") return "complete";
  if (
    status === "CREATE_TASK_FAILED" ||
    status === "GENERATE_AUDIO_FAILED" ||
    status === "CALLBACK_EXCEPTION" ||
    status === "SENSITIVE_WORD_ERROR"
  ) {
    return "error";
  }
  return "pending";
}
