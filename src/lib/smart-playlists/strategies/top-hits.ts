import { prisma } from "@/lib/prisma";
import { SMART_PLAYLIST_SIZE } from "../types";

export async function computeTopHits(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.playHistory.groupBy({
    by: ["songId"],
    where: { userId, playedAt: { gte: since } },
    _count: { songId: true },
    orderBy: { _count: { songId: "desc" } },
    take: SMART_PLAYLIST_SIZE,
  });

  if (rows.length === 0) {
    const fallback = await prisma.song.findMany({
      where: { userId, generationStatus: "ready", archivedAt: null },
      orderBy: { playCount: "desc" },
      take: SMART_PLAYLIST_SIZE,
      select: { id: true },
    });
    return fallback.map((s) => s.id);
  }

  return rows.map((r) => r.songId);
}
