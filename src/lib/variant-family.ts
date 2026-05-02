import { prisma } from "@/lib/prisma";
import { SongFilters, SongSelect } from "@/lib/songs";

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
  let rootId = songId;

  if (parentSongId) {
    rootId = parentSongId;
    let current = await prisma.song.findUnique({
      where: { id: rootId },
      select: { parentSongId: true },
    });
    while (current?.parentSongId) {
      rootId = current.parentSongId;
      current = await prisma.song.findUnique({
        where: { id: rootId },
        select: { parentSongId: true },
      });
    }
  }

  return prisma.song.findMany({
    where: SongFilters.variantFamily(rootId),
    select: SongSelect.variant,
    orderBy: { createdAt: "asc" },
  });
}
