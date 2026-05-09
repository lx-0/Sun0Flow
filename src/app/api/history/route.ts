import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-error";

const MAX_HISTORY = 50;
const DEFAULT_LIMIT = 20;
const DEDUP_WINDOW_MS = 5_000;

export const GET = authRoute(async (request, { auth }) => {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit), MAX_HISTORY);

  const [items, [{ count: rawTotal }]] = await Promise.all([
    prisma.playHistory.findMany({
      where: { userId: auth.userId },
      orderBy: { playedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

  return NextResponse.json({
    items: sliced,
    nextCursor,
    total: Number(rawTotal),
  });
}, { route: "/api/history" });

export const POST = authRoute(async (request, { auth }) => {
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
}, { route: "/api/history" });

export const DELETE = authRoute(async (_request, { auth }) => {
  await prisma.playHistory.deleteMany({ where: { userId: auth.userId } });

  return NextResponse.json({ success: true });
}, { route: "/api/history" });
