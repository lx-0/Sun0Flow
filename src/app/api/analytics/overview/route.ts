import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

function dateRangeStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const now = new Date();
    const start7d = dateRangeStart(7);
    const start30d = dateRangeStart(30);

    // Fetch user's songs
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

    if (songIds.length === 0) {
      return NextResponse.json({
        totalPlays: 0,
        uniqueListeners: 0,
        topSongs7d: [],
        topSongs30d: [],
        topSongsAllTime: [],
        topSharedByPlays: [],
        mostCommented: [],
        avgListenDuration: null,
        dailyPlays: [],
      });
    }

    // Play events aggregations
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

      // Daily play counts for the last 30 days
      prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT DATE("startedAt") as date, COUNT(*)::bigint as count
        FROM "PlayEvent"
        WHERE "songId" = ANY(${songIds}::text[])
          AND "startedAt" >= ${start30d}
        GROUP BY DATE("startedAt")
        ORDER BY date ASC
      `,
    ]);

    // Build song lookup map
    const songMap = new Map(userSongs.map((s) => [s.id, s]));

    const enrichSongs = (rows: Array<{ songId: string; _count: { songId: number } }>) => {
      return rows.map((r) => {
        const s = songMap.get(r.songId);
        return {
          id: r.songId,
          title: s?.title ?? "Untitled",
          plays: r._count.songId,
        };
      });
    }

    const topSongsAllTime = userSongs.slice(0, 5).map((s) => ({
      id: s.id,
      title: s.title ?? "Untitled",
      plays: s.playCount,
    }));

    // Top shared songs (public) sorted by play count
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

    // Fill in missing days with 0
    const dailyMap = new Map(
      dailyPlaysRaw.map((r) => [r.date.toString().slice(0, 10), Number(r.count)])
    );
    const dailyPlays: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyPlays.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    return NextResponse.json({
      totalPlays: totalPlaysRow,
      uniqueListeners: uniqueListenersRow.length,
      topSongs7d: enrichSongs(topSongs7dRaw),
      topSongs30d: enrichSongs(topSongs30dRaw),
      topSongsAllTime,
      topSharedByPlays,
      mostCommented,
      avgListenDuration: avgDurationRow._avg.durationSec,
      dailyPlays,
    });
  } catch (error) {
    logServerError("GET /api/analytics/overview", error, { route: "/api/analytics/overview" });
    return internalError();
  }
}
