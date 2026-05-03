import type { SmartPlaylistType } from "./types";

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const WEEKLY_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function refreshThreshold(type: SmartPlaylistType): number {
  return type === "top_hits" || type === "similar_to" ? WEEKLY_REFRESH_MS : DAILY_REFRESH_MS;
}

export function isStale(type: SmartPlaylistType, lastRefreshedAt: Date | null): boolean {
  const threshold = refreshThreshold(type);
  const lastRefresh = lastRefreshedAt?.getTime() ?? 0;
  return Date.now() - lastRefresh > threshold;
}
