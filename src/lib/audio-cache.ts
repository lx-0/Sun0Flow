import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

/**
 * File-system audio cache.
 *
 * Downloads from Suno are stored locally so playback never depends on
 * Suno URL availability. Once cached, audio is served from disk and will
 * survive URL expiration or deletion on Suno's side.
 *
 * Set AUDIO_CACHE_DIR to a persistent volume path in production (e.g. on
 * Railway) so files survive redeployments.
 */

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || join(process.cwd(), ".audio-cache");

let dirReady = false;

function ensureDir() {
  if (dirReady) return;
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  dirReady = true;
}

function cachePath(songId: string): string {
  // Sanitise songId to prevent path traversal
  const safe = songId.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(CACHE_DIR, `${safe}.mp3`);
}

/** Returns the cached audio buffer if it exists, null otherwise. */
export function getCachedAudio(songId: string): Buffer | null {
  const p = cachePath(songId);
  if (!existsSync(p)) return null;
  return readFileSync(p);
}

/** Returns the size of the cached file, or null if not cached. */
export function getCachedAudioSize(songId: string): number | null {
  const p = cachePath(songId);
  if (!existsSync(p)) return null;
  return statSync(p).size;
}

/** Saves audio data to the cache. */
export function cacheAudio(songId: string, data: Buffer): void {
  try {
    ensureDir();
    writeFileSync(cachePath(songId), data);
  } catch {
    // Non-fatal — worst case we fetch from Suno again next time
  }
}

/** Check whether a song is already cached. */
export function isCached(songId: string): boolean {
  return existsSync(cachePath(songId));
}

/**
 * Download audio from a URL and cache it. Returns the audio buffer.
 * Used to proactively cache audio when a song generation completes.
 */
export async function downloadAndCache(songId: string, audioUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    cacheAudio(songId, buf);
    return buf;
  } catch {
    return null;
  }
}
