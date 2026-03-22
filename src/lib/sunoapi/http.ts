import type { SunoModel, StyleTuningOptions, SunoSong, SongStatus, TaskStatus } from "./types";
import { SUNO_API_TIMEOUT_MS, SUNOAPI_KEY } from "@/lib/env";

export class SunoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SunoApiError";
    Object.setPrototypeOf(this, SunoApiError.prototype);
  }
}

export const BASE_URL = "https://api.sunoapi.org/api/v1";
export const FILE_UPLOAD_BASE_URL = "https://sunoapiorg.redpandaai.co";

/** Use a no-op callback URL — we poll for results instead of receiving callbacks */
export const NOOP_CALLBACK_URL = "https://localhost/noop";

export const DEFAULT_MODEL: SunoModel = "V5";

function getTimeoutMs(): number {
  return SUNO_API_TIMEOUT_MS;
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  const timeoutMs = getTimeoutMs();
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new SunoApiError(
          0,
          `Suno API request timed out after ${timeoutMs / 1000}s`
        );
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (res.ok) return res;

    if (!isRetryable(res.status) || attempt >= maxRetries) {
      let message: string;
      try {
        const body = (await res.json()) as { msg?: string; message?: string; error?: string };
        message = body.msg ?? body.message ?? body.error ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new SunoApiError(res.status, message);
    }

    const delay = 200 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

export function buildHeaders(apiKey?: string): HeadersInit {
  const key = apiKey || SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

/** Extract taskId from a standard { code, msg, data: { taskId } } response */
export async function extractTaskId(res: Response, context: string): Promise<string> {
  const json = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
  if (!json.data?.taskId) {
    throw new SunoApiError(500, `No taskId returned from ${context}`);
  }
  return json.data.taskId;
}

/** Append style-tuning fields to a request body if present */
export function applyStyleTuning(body: Record<string, unknown>, opts: StyleTuningOptions): void {
  if (opts.personaId != null) body.personaId = opts.personaId;
  if (opts.personaModel != null) body.personaModel = opts.personaModel;
  if (opts.negativeTags != null) body.negativeTags = opts.negativeTags;
  if (opts.vocalGender != null) body.vocalGender = opts.vocalGender;
  if (opts.styleWeight != null) body.styleWeight = opts.styleWeight;
  if (opts.weirdnessConstraint != null) body.weirdnessConstraint = opts.weirdnessConstraint;
  if (opts.audioWeight != null) body.audioWeight = opts.audioWeight;
}

/** Map raw API song data (snake_case) to our SunoSong interface */
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

/** Map task status to our SongStatus */
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
