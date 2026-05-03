import { prisma } from "@/lib/prisma";
import { SMART_PLAYLIST_SIZE } from "../types";

export async function computeNewThisWeek(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const songs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      archivedAt: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: SMART_PLAYLIST_SIZE,
    select: { id: true },
  });
  return songs.map((s) => s.id);
}
