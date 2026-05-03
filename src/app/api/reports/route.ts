import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { badRequest, notFound, rateLimited } from "@/lib/api-error";

const VALID_REASONS = ["offensive", "copyright", "spam", "other"] as const;

const createReportBody = z
  .object({
    songId: z.string().optional(),
    playlistId: z.string().optional(),
    reason: z.enum(VALID_REASONS),
    description: z.string().max(1000).optional(),
  })
  .refine(
    (data) => (data.songId ? !data.playlistId : !!data.playlistId),
    "Exactly one of songId or playlistId is required"
  );

export const POST = authRoute(async (_request, { auth, body }) => {
  const { acquired, status } = await acquireRateLimitSlot(auth.userId, "report");
  if (!acquired) {
    return rateLimited("Too many reports. Please try again later.", { rateLimit: status });
  }

  if (body.songId) {
    const song = await prisma.song.findUnique({
      where: { id: body.songId },
      select: { id: true, userId: true },
    });

    if (!song) return notFound("Song not found");
    if (song.userId === auth.userId) return badRequest("Cannot report your own song");

    const existing = await prisma.report.findFirst({
      where: { songId: body.songId, reporterId: auth.userId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You have already reported this song", code: "DUPLICATE_REPORT" },
        { status: 409 }
      );
    }
  } else {
    const playlist = await prisma.playlist.findUnique({
      where: { id: body.playlistId },
      select: { id: true, userId: true },
    });

    if (!playlist) return notFound("Playlist not found");
    if (playlist.userId === auth.userId) return badRequest("Cannot report your own playlist");

    const existing = await prisma.report.findFirst({
      where: { playlistId: body.playlistId, reporterId: auth.userId },
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
      songId: body.songId || null,
      playlistId: body.playlistId || null,
      reporterId: auth.userId,
      reason: body.reason,
      description: body.description?.trim() || null,
    },
  });

  logger.info({ reportId: report.id, songId: body.songId, playlistId: body.playlistId, userId: auth.userId, reason: body.reason }, "moderation: new report filed");

  return NextResponse.json({ id: report.id, status: "pending" }, { status: 201 });
}, { route: "/api/reports", body: createReportBody });
