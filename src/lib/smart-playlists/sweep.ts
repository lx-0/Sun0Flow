import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SmartPlaylistType } from "./compute";
import { refreshSmartPlaylist } from "./refresh";

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

export async function refreshStalePlaylists(): Promise<{ refreshed: number; skipped: number }> {
  const playlists = await prisma.playlist.findMany({
    where: { isSmartPlaylist: true },
    select: {
      id: true,
      smartPlaylistType: true,
      smartRefreshedAt: true,
    },
  });

  let refreshed = 0;
  let skipped = 0;

  for (const pl of playlists) {
    const type = pl.smartPlaylistType as SmartPlaylistType;

    if (!isStale(type, pl.smartRefreshedAt)) {
      skipped++;
      continue;
    }

    try {
      await refreshSmartPlaylist(pl.id);
      refreshed++;
    } catch (err) {
      logger.error({ err, playlistId: pl.id }, "smart-playlists: refresh failed");
    }
  }

  return { refreshed, skipped };
}
