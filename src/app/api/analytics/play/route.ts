import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { songId, durationSec } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { error: "songId is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify the song exists and is public (or belongs to user for private plays)
    const song = await prisma.song.findFirst({
      where: {
        id: songId,
        OR: [{ userId }, { isPublic: true }],
      },
      select: { id: true, userId: true },
    });

    if (!song) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Don't count the owner's own plays toward public analytics
    if (song.userId === userId) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const [event] = await prisma.$transaction([
      prisma.playEvent.create({
        data: {
          songId,
          listenerId: userId,
          durationSec: typeof durationSec === "number" ? durationSec : null,
        },
      }),
      prisma.song.update({
        where: { id: songId },
        data: { playCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ ok: true, eventId: event.id }, { status: 201 });
  } catch (error) {
    logServerError("POST /api/analytics/play", error, { route: "/api/analytics/play" });
    return internalError();
  }
}
