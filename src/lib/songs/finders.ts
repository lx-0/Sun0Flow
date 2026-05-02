import { prisma } from "@/lib/prisma";
import { SongFilters } from "./filters";
import { SongInclude } from "./projections";
import { enrichSong, type EnrichedSong, type SongWithDetail } from "./enrich";

export async function findUserSong(
  userId: string,
  songId: string
): Promise<EnrichedSong | null> {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
    include: SongInclude.detailWithoutVariations(userId),
  });
  if (!song) return null;
  return enrichSong(song as SongWithDetail);
}

export async function findPublicSong(
  songId: string,
  viewerUserId?: string
): Promise<EnrichedSong | null> {
  const song = await prisma.song.findFirst({
    where: {
      id: songId,
      ...SongFilters.publicDiscovery(),
    },
    include: SongInclude.detailWithoutVariations(viewerUserId ?? ""),
  });
  if (!song) return null;
  return enrichSong(song as SongWithDetail);
}
