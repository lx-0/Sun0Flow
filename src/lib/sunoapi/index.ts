/**
 * sunoapi.org API client
 *
 * Tree-shakeable, no side-effects on import.
 * API key is read from SUNOAPI_KEY env var at call time — never hard-coded.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SongStatus = "pending" | "streaming" | "complete" | "error";

export type TaskStatus =
  | "PENDING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export interface SunoSong {
  id: string;
  title: string;
  prompt: string;
  tags?: string;
  audioUrl: string;
  imageUrl?: string;
  duration?: number;
  status: SongStatus;
  model?: string;
  lyrics?: string;
  createdAt: string;
}

export interface GenerateSongOptions {
  style?: string;
  title?: string;
  instrumental?: boolean;
  model?: string;
}

export interface GenerateResult {
  taskId: string;
}

export interface TaskStatusResult {
  taskId: string;
  status: TaskStatus;
  songs: SunoSong[];
  errorMessage?: string | null;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class SunoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SunoApiError";
    // Restore prototype chain for instanceof checks in transpiled envs
    Object.setPrototypeOf(this, SunoApiError.prototype);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const BASE_URL = "https://api.sunoapi.org/api/v1";

/** Use a no-op callback URL — we poll for results instead of receiving callbacks */
const NOOP_CALLBACK_URL = "https://localhost/noop";

const DEFAULT_MODEL = "V4";

/** Statuses that should trigger a retry */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);

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

    // Exponential back-off: 200ms, 400ms, 800ms …
    const delay = 200 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

function buildHeaders(apiKey?: string): HeadersInit {
  const key = apiKey || process.env.SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

/** Map raw API song data (snake_case) to our SunoSong interface */
function mapRawSong(raw: Record<string, unknown>): SunoSong {
  return {
    id: (raw.id as string) ?? "",
    title: (raw.title as string) ?? "",
    prompt: (raw.prompt as string) ?? "",
    tags: (raw.tags as string) ?? undefined,
    audioUrl: (raw.audio_url as string) ?? (raw.audioUrl as string) ?? "",
    imageUrl: (raw.image_url as string) ?? (raw.imageUrl as string) ?? undefined,
    duration: (raw.duration as number) ?? undefined,
    status: "pending",
    model: (raw.model_name as string) ?? (raw.modelName as string) ?? undefined,
    lyrics: (raw.prompt as string) ?? undefined,
    createdAt: (raw.createTime as string) ?? (raw.createdAt as string) ?? new Date().toISOString(),
  };
}

/** Map task status to our SongStatus */
function taskStatusToSongStatus(status: TaskStatus): SongStatus {
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

// ─── Client methods ───────────────────────────────────────────────────────────

/**
 * Generate songs from a text prompt.
 * Returns a taskId — songs are generated asynchronously.
 * Poll with getTaskStatus() to get the completed songs.
 */
export async function generateSong(
  prompt: string,
  options: GenerateSongOptions = {},
  apiKey?: string
): Promise<GenerateResult> {
  const instrumental = options.instrumental ?? false;
  const customMode = !!(options.title || options.style);

  const body: Record<string, unknown> = {
    prompt,
    instrumental,
    customMode,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.style) body.style = options.style;
  if (options.title) body.title = options.title;

  const res = await fetchWithRetry(`${BASE_URL}/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };

  if (!json.data?.taskId) {
    throw new SunoApiError(500, "No taskId returned from generate API");
  }

  return { taskId: json.data.taskId };
}

/**
 * Poll for the status and results of a generation task.
 */
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
  };
}

/**
 * List all songs associated with the account's API key.
 */
export async function listSongs(apiKey?: string): Promise<SunoSong[]> {
  const res = await fetchWithRetry(`${BASE_URL}/songs`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
  const data = (await res.json()) as { clips?: SunoSong[]; data?: SunoSong[] };
  return data.clips ?? data.data ?? [];
}

/**
 * Fetch a single song by ID.
 */
export async function getSongById(id: string, apiKey?: string): Promise<SunoSong> {
  const res = await fetchWithRetry(`${BASE_URL}/songs/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
  const data = (await res.json()) as { clip?: SunoSong; data?: SunoSong };
  const song = data.clip ?? data.data;
  if (!song) {
    throw new SunoApiError(404, `Song ${id} not found in response`);
  }
  return song;
}

/**
 * Download the raw audio for a song as an ArrayBuffer.
 */
export async function downloadSong(id: string, apiKey?: string): Promise<ArrayBuffer> {
  const song = await getSongById(id, apiKey);
  const audioRes = await fetchWithRetry(song.audioUrl, {
    method: "GET",
  });
  return audioRes.arrayBuffer();
}

// ─── Default singleton (convenience export) ───────────────────────────────────

export const sunoApi = {
  generateSong,
  getTaskStatus,
  listSongs,
  getSongById,
  downloadSong,
} as const;
