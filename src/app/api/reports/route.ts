import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const VALID_REASONS = ["offensive", "copyright", "spam", "other"];

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Rate limit: 10 reports per hour
    const { acquired, status } = await acquireRateLimitSlot(userId, "report");
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many reports. Please try again later.", code: "RATE_LIMIT", status },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { songId, playlistId, reason, description } = body;

    if ((!songId && !playlistId) || (songId && playlistId)) {
      return NextResponse.json({ error: "Exactly one of songId or playlistId is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if ((songId && typeof songId !== "string") || (playlistId && typeof playlistId !== "string")) {
      return NextResponse.json({ error: "songId and playlistId must be strings", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (songId) {
      // Verify song exists
      const song = await prisma.song.findUnique({
        where: { id: songId },
        select: { id: true, userId: true },
      });

      if (!song) {
        return NextResponse.json({ error: "Song not found", code: "NOT_FOUND" }, { status: 404 });
      }

      // Don't allow reporting your own songs
      if (song.userId === userId) {
        return NextResponse.json({ error: "Cannot report your own song", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      // Prevent duplicate reports
      const existing = await prisma.report.findFirst({
        where: { songId, reporterId: userId },
        select: { id: true },
      });

      if (existing) {
        return NextResponse.json(
          { error: "You have already reported this song", code: "DUPLICATE_REPORT" },
          { status: 409 }
        );
      }
    } else {
      // Verify playlist exists
      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
        select: { id: true, userId: true },
      });

      if (!playlist) {
        return NextResponse.json({ error: "Playlist not found", code: "NOT_FOUND" }, { status: 404 });
      }

      // Don't allow reporting your own playlists
      if (playlist.userId === userId) {
        return NextResponse.json({ error: "Cannot report your own playlist", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      // Prevent duplicate reports
      const existing = await prisma.report.findFirst({
        where: { playlistId, reporterId: userId },
        select: { id: true },
      });

      if (existing) {
        return NextResponse.json(
          { error: "You have already reported this playlist", code: "DUPLICATE_REPORT" },
          { status: 409 }
        );
      }
    }

    const report = await prisma.report.create({
      data: {
        songId: songId || null,
        playlistId: playlistId || null,
        reporterId: userId,
        reason,
        description: description?.trim()?.slice(0, 1000) || null,
      },
    });

    // Console log placeholder for admin notification
    logger.info({ reportId: report.id, songId, playlistId, userId, reason }, "moderation: new report filed");

    return NextResponse.json({ id: report.id, status: "pending" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
