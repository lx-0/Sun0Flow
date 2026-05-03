import { prisma } from "@/lib/prisma";
import { SMART_PLAYLIST_SIZE } from "../types";

export async function computeMood(userId: string, mood: string): Promise<string[]> {
  const songs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      archivedAt: null,
      tags: { contains: mood, mode: "insensitive" },
    },
    orderBy: { playCount: "desc" },
    take: SMART_PLAYLIST_SIZE,
    select: { id: true },
  });
  return songs.map((s) => s.id);
}
