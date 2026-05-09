import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id: songId } = await params;

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: {
        id: true,
        title: true,
        playCount: true,
        viewCount: true,
        duration: true,
        isPublic: true,
      },
    });

    if (!song) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Views over last 7 days
    const viewsRaw = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("viewedAt") as date, COUNT(*)::bigint as count
      FROM "SongView"
      WHERE "songId" = ${songId}
        AND "viewedAt" >= ${sevenDaysAgo}
      GROUP BY DATE("viewedAt")
      ORDER BY date ASC
    `;

    const now = new Date();
    const viewMap = new Map(
      viewsRaw.map((r) => [r.date.toString().slice(0, 10), Number(r.count)])
    );
    const views7d: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      views7d.push({ date: key, count: viewMap.get(key) ?? 0 });
    }

    return NextResponse.json({
      songId: song.id,
      title: song.title ?? "Untitled",
      totalPlays: song.playCount,
      totalViews: song.viewCount,
      isPublic: song.isPublic,
      views7d,
    });
  } catch (error) {
    logServerError("GET /api/songs/[id]/analytics", error, {
      route: "/api/songs/[id]/analytics",
    });
    return internalError();
  }
}
