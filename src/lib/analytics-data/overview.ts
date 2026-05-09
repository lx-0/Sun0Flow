import { prisma } from "@/lib/prisma";
import { dateRangeStart, fillDailySeries } from "./dates";

interface SongSummary {
  id: string;
  title: string;
  plays: number;
}

export interface UserOverview {
  totalPlays: number;
  uniqueListeners: number;
  topSongs7d: SongSummary[];
  topSongs30d: SongSummary[];
  topSongsAllTime: SongSummary[];
  topSharedByPlays: Array<SongSummary & { views: number }>;
  mostCommented: Array<{ id: string; title: string; comments: number }>;
  avgListenDuration: number | null;
  dailyPlays: Array<{ date: string; count: number }>;
}

const EMPTY_OVERVIEW: UserOverview = {
  totalPlays: 0,
  uniqueListeners: 0,
  topSongs7d: [],
  topSongs30d: [],
  topSongsAllTime: [],
  topSharedByPlays: [],
  mostCommented: [],
  avgListenDuration: null,
  dailyPlays: [],
};

export async function getUserOverview(userId: string): Promise<UserOverview> {
  const start7d = dateRangeStart(7);
  const start30d = dateRangeStart(30);

  const userSongs = await prisma.song.findMany({
    where: { userId, generationStatus: "ready" },
    select: {
      id: true,
      title: true,
      playCount: true,
      viewCount: true,
      isPublic: true,
      duration: true,
      createdAt: true,
      _count: { select: { comments: true } },
    },
    orderBy: { playCount: "desc" },
  });

  const songIds = userSongs.map((s) => s.id);
  if (songIds.length === 0) return EMPTY_OVERVIEW;

  const [
    totalPlaysRow,
    uniqueListenersRow,
    avgDurationRow,
    topSongs7dRaw,
    topSongs30dRaw,
    dailyPlaysRaw,
  ] = await Promise.all([
    prisma.playEvent.count({ where: { songId: { in: songIds } } }),

    prisma.playEvent.groupBy({
      by: ["listenerId"],
      where: { songId: { in: songIds }, listenerId: { not: null } },
      _count: true,
    }),

    prisma.playEvent.aggregate({
      where: { songId: { in: songIds }, durationSec: { not: null } },
      _avg: { durationSec: true },
    }),

    prisma.playEvent.groupBy({
      by: ["songId"],
      where: { songId: { in: songIds }, startedAt: { gte: start7d } },
      _count: { songId: true },
      orderBy: { _count: { songId: "desc" } },
      take: 5,
    }),

    prisma.playEvent.groupBy({
      by: ["songId"],
      where: { songId: { in: songIds }, startedAt: { gte: start30d } },
      _count: { songId: true },
      orderBy: { _count: { songId: "desc" } },
      take: 5,
    }),

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("startedAt") as date, COUNT(*)::bigint as count
      FROM "PlayEvent"
      WHERE "songId" = ANY(${songIds}::text[])
        AND "startedAt" >= ${start30d}
      GROUP BY DATE("startedAt")
      ORDER BY date ASC
    `,
  ]);

  const songMap = new Map(userSongs.map((s) => [s.id, s]));

  const enrichSongs = (rows: Array<{ songId: string; _count: { songId: number } }>) =>
    rows.map((r) => ({
      id: r.songId,
      title: songMap.get(r.songId)?.title ?? "Untitled",
      plays: r._count.songId,
    }));

  const topSongsAllTime = userSongs.slice(0, 5).map((s) => ({
    id: s.id,
    title: s.title ?? "Untitled",
    plays: s.playCount,
  }));

  const topSharedByPlays = userSongs
    .filter((s) => s.isPublic)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title ?? "Untitled",
      plays: s.playCount,
      views: s.viewCount,
    }));

  const mostCommented = [...userSongs]
    .sort((a, b) => b._count.comments - a._count.comments)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title ?? "Untitled",
      comments: s._count.comments,
    }));

  return {
    totalPlays: totalPlaysRow,
    uniqueListeners: uniqueListenersRow.length,
    topSongs7d: enrichSongs(topSongs7dRaw),
    topSongs30d: enrichSongs(topSongs30dRaw),
    topSongsAllTime,
    topSharedByPlays,
    mostCommented,
    avgListenDuration: avgDurationRow._avg.durationSec,
    dailyPlays: fillDailySeries(dailyPlaysRaw, 30),
  };
}
