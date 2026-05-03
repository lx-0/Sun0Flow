import type { SmartPlaylistType } from "./types";
import { computeTopHits } from "./strategies/top-hits";
import { computeNewThisWeek } from "./strategies/new-this-week";
import { computeMood } from "./strategies/mood";
import { computeSimilarTo } from "./strategies/similar-to";

export async function computeSmartPlaylistSongs(
  userId: string,
  type: SmartPlaylistType,
  meta: Record<string, string> | null,
): Promise<string[]> {
  switch (type) {
    case "top_hits":
      return computeTopHits(userId);
    case "new_this_week":
      return computeNewThisWeek(userId);
    case "mood": {
      const mood = meta?.mood ?? "chill";
      return computeMood(userId, mood);
    }
    case "similar_to": {
      const sourceSongId = meta?.sourceSongId;
      if (!sourceSongId) return [];
      return computeSimilarTo(userId, sourceSongId);
    }
    default:
      return [];
  }
}
