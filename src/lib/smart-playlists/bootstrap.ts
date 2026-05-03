import { prisma } from "@/lib/prisma";
import type { SmartPlaylistType } from "./types";
import { refreshSmartPlaylist } from "./refresh";

const DEFAULTS: Array<{
  type: SmartPlaylistType;
  name: string;
  description: string;
  meta: Record<string, string> | null;
}> = [
  {
    type: "top_hits",
    name: "Your Top Hits",
    description: "Your most-played songs from the last 30 days",
    meta: null,
  },
  {
    type: "new_this_week",
    name: "New This Week",
    description: "Songs you created in the last 7 days",
    meta: null,
  },
  {
    type: "mood",
    name: "Mood: Chill",
    description: "Songs tagged with a chill vibe",
    meta: { mood: "chill" },
  },
];

function playlistKey(type: string, meta: Record<string, string> | null): string {
  return `${type}:${meta?.mood ?? meta?.sourceSongId ?? ""}`;
}

export async function ensureDefaultSmartPlaylists(userId: string): Promise<void> {
  const existing = await prisma.playlist.findMany({
    where: { userId, isSmartPlaylist: true },
    select: { smartPlaylistType: true, smartPlaylistMeta: true },
  });

  const existingKeys = new Set(
    existing.map((p) => playlistKey(
      p.smartPlaylistType ?? "",
      p.smartPlaylistMeta as Record<string, string> | null,
    )),
  );

  for (const def of DEFAULTS) {
    const key = playlistKey(def.type, def.meta);
    if (existingKeys.has(key)) continue;

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: def.name,
        description: def.description,
        isSmartPlaylist: true,
        smartPlaylistType: def.type,
        smartPlaylistMeta: def.meta ?? undefined,
      },
    });

    await refreshSmartPlaylist(playlist.id);
  }
}
