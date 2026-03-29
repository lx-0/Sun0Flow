import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

const MAX_HISTORY = 50;
const DEFAULT_LIMIT = 20;
const DEDUP_WINDOW_MS = 5_000;

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit), MAX_HISTORY);

    const [items, [{ count: rawTotal }]] = await Promise.all([
      prisma.playHistory.findMany({
        where: { userId },
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
        SELECT COUNT(*)::bigint as count FROM "PlayHistory" WHERE "userId" = ${userId}
      `,
    ]);

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;
    const total = rawTotal;

    return NextResponse.json({
      items: sliced,
      nextCursor,
      total: Number(total),
    });
  } catch (error) {
    logServerError("GET /api/history", error, { route: "/api/history" });
    return internalError();
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { songId } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { error: "songId is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify the song belongs to the user and exists
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { id: true },
    });
    if (!song) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Dedup: skip if same song was logged within the last DEDUP_WINDOW_MS
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await prisma.playHistory.findFirst({
      where: { userId, songId, playedAt: { gte: cutoff } },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    // Insert new history entry
    const entry = await prisma.playHistory.create({
      data: { userId, songId },
    });

    // Prune to MAX_HISTORY entries (ring buffer) — fire and forget
    prisma.playHistory
      .findMany({
        where: { userId },
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
  } catch (error) {
    logServerError("POST /api/history", error, { route: "/api/history" });
    return internalError();
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    await prisma.playHistory.deleteMany({ where: { userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerError("DELETE /api/history", error, { route: "/api/history" });
    return internalError();
  }
}
