import { refreshStalePlaylists } from "@/lib/smart-playlists";
import { logger } from "@/lib/logger";

export async function smartPlaylistRefresh(): Promise<void> {
  const { refreshed, skipped } = await refreshStalePlaylists();
  logger.info({ refreshed, skipped }, "jobs: smart-playlist-refresh done");
}
