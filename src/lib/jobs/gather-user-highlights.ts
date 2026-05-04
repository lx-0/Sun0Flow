import { prisma } from "@/lib/prisma";
import type { UserHighlights } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_SONGS_LIMIT = 5;

export async function gatherUserHighlights(
  userId: string,
  now: number = Date.now()
): Promise<UserHighlights> {
  const oneWeekAgo = new Date(now - WEEK_MS);

  const [topSongs, weekGenerations, playsAggregate, newFollowers] =
    await Promise.all([
      prisma.song.findMany({
        where: {
          userId,
          generationStatus: "ready",
          createdAt: { gte: oneWeekAgo },
        },
        orderBy: { playCount: "desc" },
        take: TOP_SONGS_LIMIT,
        select: { id: true, title: true, playCount: true },
      }),
      prisma.song.count({
        where: {
          userId,
          createdAt: { gte: oneWeekAgo },
          generationStatus: "ready",
        },
      }),
      prisma.song.aggregate({
        where: { userId, generationStatus: "ready" },
        _sum: { playCount: true },
      }),
      prisma.follow.count({
        where: { followingId: userId, createdAt: { gte: oneWeekAgo } },
      }),
    ]);

  return {
    topSongs,
    weekGenerations,
    totalPlaysReceived: playsAggregate._sum.playCount ?? 0,
    newFollowers,
  };
}
