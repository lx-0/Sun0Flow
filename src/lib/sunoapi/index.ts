/**
 * sunoapi.org API client
 *
 * Tree-shakeable, no side-effects on import.
 * API key is read from SUNOAPI_KEY env var at call time — never hard-coded.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SongStatus = "pending" | "streaming" | "complete" | "error";

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
  createdAt: string;
}

export interface GenerateSongOptions {
  tags?: string;
  title?: string;
  makeInstrumental?: boolean;
  waitAudio?: boolean;
  model?: string;
  count?: number;
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
        const body = (await res.json()) as { message?: string; error?: string };
        message = body.message ?? body.error ?? res.statusText;
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

function buildHeaders(): HeadersInit {
  const key = process.env.SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

// ─── Client methods ───────────────────────────────────────────────────────────

/**
 * Generate one or more songs from a text prompt.
 * Returns an array of SunoSong objects (may still be pending/streaming).
 */
export async function generateSong(
  prompt: string,
  options: GenerateSongOptions = {}
): Promise<SunoSong[]> {
  const res = await fetchWithRetry(`${BASE_URL}/generate`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ prompt, ...options }),
  });
  const data = (await res.json()) as { clips?: SunoSong[]; data?: SunoSong[] };
  return data.clips ?? data.data ?? [];
}

/**
 * List all songs associated with the account's API key.
 */
export async function listSongs(): Promise<SunoSong[]> {
  const res = await fetchWithRetry(`${BASE_URL}/songs`, {
    method: "GET",
    headers: buildHeaders(),
  });
  const data = (await res.json()) as { clips?: SunoSong[]; data?: SunoSong[] };
  return data.clips ?? data.data ?? [];
}

/**
 * Fetch a single song by ID.
 */
export async function getSongById(id: string): Promise<SunoSong> {
  const res = await fetchWithRetry(`${BASE_URL}/songs/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: buildHeaders(),
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
export async function downloadSong(id: string): Promise<ArrayBuffer> {
  const song = await getSongById(id);
  const audioRes = await fetchWithRetry(song.audioUrl, {
    method: "GET",
  });
  return audioRes.arrayBuffer();
}

// ─── Default singleton (convenience export) ───────────────────────────────────

export const sunoApi = {
  generateSong,
  listSongs,
  getSongById,
  downloadSong,
} as const;
