import type { QueueSong, RadioParams } from "@/components/queue/queue-context-types";

export function buildRadioRequestUrl(
  origin: string,
  params: RadioParams,
  excludeIds: string[],
  limit = 20,
): string {
  const url = new URL("/api/radio", origin);
  if (params.mood) url.searchParams.set("mood", params.mood);
  if (params.genre) url.searchParams.set("genre", params.genre);
  if (params.tempoMin != null) url.searchParams.set("tempoMin", String(params.tempoMin));
  if (params.tempoMax != null) url.searchParams.set("tempoMax", String(params.tempoMax));
  if (params.seedSongId) url.searchParams.set("seedSongId", params.seedSongId);
  if (excludeIds.length > 0) url.searchParams.set("excludeIds", excludeIds.join(","));
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

export function removeFutureSongFromQueue(
  queue: QueueSong[],
  currentIndex: number,
  songId: string,
): QueueSong[] {
  const songIndex = queue.findIndex((song, index) => song.id === songId && index > currentIndex);
  if (songIndex < 0) return queue;
  const next = [...queue];
  next.splice(songIndex, 1);
  return next;
}
