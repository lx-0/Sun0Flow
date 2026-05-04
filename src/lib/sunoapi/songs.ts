import type { SunoSong } from "./types";
import { SunoApiError } from "./errors";
import { BASE_URL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";

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
