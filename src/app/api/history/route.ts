import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-error";
import { zLimitParam, zCursorParam } from "@/lib/query-params";
import { cursorPaginate } from "@/lib/pagination";

const MAX_HISTORY = 50;
const DEDUP_WINDOW_MS = 5_000;

const historyQuery = z.object({
  limit: zLimitParam(20, MAX_HISTORY),
  cursor: zCursorParam,
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const [items, [{ count: rawTotal }]] = await Promise.all([
      prisma.playHistory.findMany({
        where: { userId: auth.userId },
        orderBy: { playedAt: "desc" },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          song: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              audioUrl: true,
              duration: true,
              lyrics: true,
              generationStatus: true,
              archivedAt: true,
            },
          },
        },
      }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint as count FROM "PlayHistory" WHERE "userId" = ${auth.userId}
      `,
    ]);

    const { items: sliced, nextCursor } = cursorPaginate(items, query.limit);

    return NextResponse.json({
      items: sliced,
      nextCursor,
      total: Number(rawTotal),
    });
  },
  { route: "/api/history", query: historyQuery },
);

export const POST = authRoute(
  async (request, { auth }) => {
    const body = await request.json();
    const { songId } = body;

    if (!songId || typeof songId !== "string") {
      return badRequest("songId is required");
    }

    const song = await prisma.song.findFirst({
      where: { id: songId, userId: auth.userId },
      select: { id: true },
    });
    if (!song) {
      return notFound("Song not found");
    }

    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await prisma.playHistory.findFirst({
      where: { userId: auth.userId, songId, playedAt: { gte: cutoff } },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    const entry = await prisma.playHistory.create({
      data: { userId: auth.userId, songId },
    });

    prisma.playHistory
      .findMany({
        where: { userId: auth.userId },
        orderBy: { playedAt: "desc" },
        skip: MAX_HISTORY,
        select: { id: true },
      })
      .then((old) => {
        if (old.length === 0) return;
        return prisma.playHistory.deleteMany({
          where: { id: { in: old.map((e) => e.id) } },
        });
      })
      .catch(() => {});

    return NextResponse.json({ entry }, { status: 201 });
  },
  { route: "/api/history" },
);

export const DELETE = authRoute(
  async (_request, { auth }) => {
    await prisma.playHistory.deleteMany({ where: { userId: auth.userId } });

    return NextResponse.json({ success: true });
  },
  { route: "/api/history" },
);
