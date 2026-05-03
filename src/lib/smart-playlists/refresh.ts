import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SmartPlaylistType } from "./types";
import { computeSmartPlaylistSongs } from "./compute";

export async function refreshSmartPlaylist(playlistId: string): Promise<void> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: {
      id: true,
      userId: true,
      isSmartPlaylist: true,
      smartPlaylistType: true,
      smartPlaylistMeta: true,
    },
  });

  if (!playlist?.isSmartPlaylist || !playlist.smartPlaylistType) return;

  const songIds = await computeSmartPlaylistSongs(
    playlist.userId,
    playlist.smartPlaylistType as SmartPlaylistType,
    playlist.smartPlaylistMeta as Record<string, string> | null,
  );

  await prisma.$transaction([
    prisma.playlistSong.deleteMany({ where: { playlistId } }),
    ...(songIds.length > 0
      ? [
          prisma.playlistSong.createMany({
            data: songIds.map((songId, idx) => ({
              playlistId,
              songId,
              position: idx,
              addedByUserId: null,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    prisma.playlist.update({
      where: { id: playlistId },
      data: { smartRefreshedAt: new Date() },
    }),
  ]);

  logger.info({ playlistId, type: playlist.smartPlaylistType, count: songIds.length }, "smart-playlists: refreshed");
}
