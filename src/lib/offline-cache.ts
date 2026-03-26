/**
 * Offline song caching — stores audio in Cache API and tracks metadata in localStorage.
 *
 * The service worker serves `/api/audio/{songId}` from cache-first when the response
 * has been explicitly stored here, enabling offline playback without any changes to
 * the audio player code.
 */

const AUDIO_CACHE = "sunoflow-audio-v1";
const METADATA_KEY = "offline_songs_meta_v1";
/** Default eviction threshold: 500 MB */
const DEFAULT_LIMIT_BYTES = 500 * 1024 * 1024;

export interface OfflineSongMeta {
  id: string;
  title: string | null;
  imageUrl: string | null;
  cachedAt: number;
  /** Approximate size in bytes */
  size: number;
}

// ─── Metadata helpers (localStorage) ─────────────────────────────────────────

function readMeta(): OfflineSongMeta[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(METADATA_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeMeta(meta: OfflineSongMeta[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(METADATA_KEY, JSON.stringify(meta));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns a Set of song IDs that have been explicitly saved for offline playback. */
export function getCachedSongIds(): Set<string> {
  return new Set(readMeta().map((m) => m.id));
}

/** Returns aggregate statistics about the offline cache. */
export function getCacheStats(): { count: number; totalBytes: number } {
  const meta = readMeta();
  return {
    count: meta.length,
    totalBytes: meta.reduce((acc, m) => acc + m.size, 0),
  };
}

/** Returns all cached song metadata entries, sorted by most-recently cached first. */
export function getCachedSongsMeta(): OfflineSongMeta[] {
  return readMeta().slice().sort((a, b) => b.cachedAt - a.cachedAt);
}

/**
 * Fetches and caches the audio for a song.
 * Stores the response under the proxied URL so the service worker can serve
 * it offline, and records size metadata in localStorage.
 * Throws on network error or non-OK response.
 */
export async function cacheSong(song: {
  id: string;
  title: string | null;
  imageUrl: string | null;
}): Promise<void> {
  const url = `/api/audio/${song.id}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);

  const clone = response.clone();
  const cache = await caches.open(AUDIO_CACHE);
  await cache.put(url, response);

  // Measure size from the cloned body
  let size = 0;
  try {
    const buf = await clone.arrayBuffer();
    size = buf.byteLength;
  } catch {
    // Best-effort; fall back to 0
  }

  const meta = readMeta();
  const idx = meta.findIndex((m) => m.id === song.id);
  const entry: OfflineSongMeta = {
    id: song.id,
    title: song.title,
    imageUrl: song.imageUrl,
    cachedAt: Date.now(),
    size,
  };
  if (idx >= 0) {
    meta[idx] = entry;
  } else {
    meta.push(entry);
  }
  writeMeta(meta);

  await autoEvict();
}

/**
 * Removes a single song from the offline cache (both Cache API and metadata).
 */
export async function removeSong(songId: string): Promise<void> {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(`/api/audio/${songId}`);
  writeMeta(readMeta().filter((m) => m.id !== songId));
}

/**
 * Removes all explicitly-saved offline songs.
 */
export async function clearAllCachedSongs(): Promise<void> {
  const cache = await caches.open(AUDIO_CACHE);
  const meta = readMeta();
  await Promise.all(meta.map((m) => cache.delete(`/api/audio/${m.id}`)));
  writeMeta([]);
}

// ─── Auto-eviction ────────────────────────────────────────────────────────────

/**
 * Evicts the oldest cached songs until total usage is below the limit.
 */
async function autoEvict(limitBytes = DEFAULT_LIMIT_BYTES): Promise<void> {
  const stats = getCacheStats();
  if (stats.totalBytes < limitBytes) return;

  // Sort ascending by cachedAt (oldest first)
  const sorted = readMeta().slice().sort((a, b) => a.cachedAt - b.cachedAt);
  for (const entry of sorted) {
    if (getCacheStats().totalBytes < limitBytes) break;
    await removeSong(entry.id);
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Formats bytes into a human-readable string (KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
