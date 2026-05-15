import { prisma } from "@/lib/prisma";
import { fillDailySeries, dateRangeStart } from "@/lib/date-series";
import { type Result, success, Err } from "@/lib/result";

export interface SongAnalytics {
  songId: string;
  title: string;
  totalPlays: number;
  trackedPlays: number;
  uniqueListeners: number;
  avgListenDuration: number | null;
  songDuration: number | null;
  totalComments: number;
  dailyPlays: Array<{ date: string; count: number }>;
  retentionCurve: Array<{ pct: number; count: number; rate: number }>;
}

export async function getSongAnalytics(
  userId: string,
  songId: string,
): Promise<Result<SongAnalytics>> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    select: {
      id: true,
      title: true,
      playCount: true,
      duration: true,
      createdAt: true,
      _count: { select: { comments: true } },
    },
  });

  if (!song) return Err.notFound("Song not found");

  const thirtyDaysAgo = dateRangeStart(30);

  const [
    totalEvents,
    uniqueListeners,
    avgDuration,
    dailyPlaysRaw,
    durationBucketsRaw,
  ] = await Promise.all([
    prisma.playEvent.count({ where: { songId } }),

    prisma.playEvent.groupBy({
      by: ["listenerId"],
      where: { songId, listenerId: { not: null } },
      _count: true,
    }),

    prisma.playEvent.aggregate({
      where: { songId, durationSec: { not: null } },
      _avg: { durationSec: true },
    }),

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("startedAt") as date, COUNT(*)::bigint as count
      FROM "PlayEvent"
      WHERE "songId" = ${songId}
        AND "startedAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("startedAt")
      ORDER BY date ASC
    `,

    song.duration
      ? prisma.$queryRaw<Array<{ bucket: number; count: bigint }>>`
          SELECT
            FLOOR("durationSec" / ${song.duration} * 10) AS bucket,
            COUNT(*)::bigint AS count
          FROM "PlayEvent"
          WHERE "songId" = ${songId}
            AND "durationSec" IS NOT NULL
            AND "durationSec" <= ${song.duration}
          GROUP BY bucket
          ORDER BY bucket ASC
        `
      : Promise.resolve([]),
  ]);

  const retentionMap = new Map(
    (durationBucketsRaw as Array<{ bucket: number; count: bigint }>).map(
      (r) => [Number(r.bucket), Number(r.count)],
    ),
  );
  const maxBucket = totalEvents > 0 ? totalEvents : 1;
  const retentionCurve = Array.from({ length: 11 }, (_, i) => ({
    pct: i * 10,
    count: retentionMap.get(i) ?? 0,
    rate: ((retentionMap.get(i) ?? 0) / maxBucket) * 100,
  }));

  return success({
    songId,
    title: song.title ?? "Untitled",
    totalPlays: song.playCount,
    trackedPlays: totalEvents,
    uniqueListeners: uniqueListeners.length,
    avgListenDuration: avgDuration._avg.durationSec,
    songDuration: song.duration,
    totalComments: song._count.comments,
    dailyPlays: fillDailySeries(dailyPlaysRaw, 30),
    retentionCurve,
  });
}
