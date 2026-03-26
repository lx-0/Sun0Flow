import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { songId } = await params;

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

    if (!song) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

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

      // Daily plays for last 30 days
      prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT DATE("startedAt") as date, COUNT(*)::bigint as count
        FROM "PlayEvent"
        WHERE "songId" = ${songId}
          AND "startedAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("startedAt")
        ORDER BY date ASC
      `,

      // Listener retention: bucket durationSec into 10% increments of song duration
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

    // Build daily chart filling missing days
    const now = new Date();
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

    // Build retention curve: 11 buckets (0-10), each represents 10% of song
    const retentionMap = new Map(
      (durationBucketsRaw as Array<{ bucket: number; count: bigint }>).map(
        (r) => [Number(r.bucket), Number(r.count)]
      )
    );
    const maxBucket = totalEvents > 0 ? totalEvents : 1;
    const retentionCurve = Array.from({ length: 11 }, (_, i) => ({
      pct: i * 10,
      count: retentionMap.get(i) ?? 0,
      rate: ((retentionMap.get(i) ?? 0) / maxBucket) * 100,
    }));

    return NextResponse.json({
      songId,
      title: song.title ?? "Untitled",
      totalPlays: song.playCount,
      trackedPlays: totalEvents,
      uniqueListeners: uniqueListeners.length,
      avgListenDuration: avgDuration._avg.durationSec,
      songDuration: song.duration,
      totalComments: song._count.comments,
      dailyPlays,
      retentionCurve,
    });
  } catch (error) {
    logServerError("GET /api/analytics/songs/[songId]", error, {
      route: "/api/analytics/songs/[songId]",
    });
    return internalError();
  }
}
