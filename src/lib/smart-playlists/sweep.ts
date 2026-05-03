import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SmartPlaylistType } from "./types";
import { isStale } from "./staleness";
import { refreshSmartPlaylist } from "./refresh";

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
