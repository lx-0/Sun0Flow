import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { songId, reason } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json({ error: "songId is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 characters", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify song exists, is hidden, and belongs to the user
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, userId: true, isHidden: true, title: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Song not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (song.userId !== userId) {
      return NextResponse.json({ error: "You can only appeal your own songs", code: "FORBIDDEN" }, { status: 403 });
    }

    if (!song.isHidden) {
      return NextResponse.json(
        { error: "This song is not hidden and does not need an appeal", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Rate limit: max 1 appeal per song
    const existing = await prisma.appeal.findUnique({
      where: { songId_userId: { songId, userId } },
      select: { id: true, status: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You have already submitted an appeal for this song", code: "DUPLICATE_APPEAL", appeal: existing },
        { status: 409 }
      );
    }

    const appeal = await prisma.appeal.create({
      data: {
        songId,
        userId,
        reason: reason.trim().slice(0, 2000),
      },
    });

    logger.info({ appealId: appeal.id, songId, userId }, "moderation: appeal filed");

    return NextResponse.json({ id: appeal.id, status: "pending" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
