import { prisma } from "@/lib/prisma";
import { resolveRootId } from "./variations";
import { SongFilters } from "./filters";
import { SongSelect, SongInclude, enrichSong, type SongWithDetail, type EnrichedSong } from "./projections";

export interface PublicVariant {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
  createdAt: Date;
}

export async function getVariantFamily(
  songId: string,
  parentSongId: string | null
): Promise<PublicVariant[]> {
  const rootId = await resolveRootId(songId, parentSongId);

  return prisma.song.findMany({
    where: SongFilters.variantFamily(rootId),
    select: SongSelect.variant,
    orderBy: { createdAt: "asc" },
  });
}

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
