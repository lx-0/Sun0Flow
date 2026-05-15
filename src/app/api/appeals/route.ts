import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { authRoute } from "@/lib/route-handler";

const appealBodySchema = z.object({
  songId: z.string(),
  reason: z.string(),
});

export const POST = authRoute(
  async (_request, { auth, body }) => {
    const reason = body.reason.trim();
    if (reason.length < 10) {
      return badRequest("reason must be at least 10 characters");
    }

    // Verify song exists, is hidden, and belongs to the user
    const song = await prisma.song.findUnique({
      where: { id: body.songId },
      select: { id: true, userId: true, isHidden: true, title: true },
    });

    if (!song) {
      return notFound("Song not found");
    }

    if (song.userId !== auth.userId) {
      return forbidden("You can only appeal your own songs");
    }

    if (!song.isHidden) {
      return badRequest("This song is not hidden and does not need an appeal");
    }

    // Rate limit: max 1 appeal per song
    const existing = await prisma.appeal.findUnique({
      where: { songId_userId: { songId: body.songId, userId: auth.userId } },
      select: { id: true, status: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You have already submitted an appeal for this song", code: "DUPLICATE_APPEAL", appeal: existing },
        { status: 409 },
      );
    }

    const appeal = await prisma.appeal.create({
      data: {
        songId: body.songId,
        userId: auth.userId,
        reason: reason.slice(0, 2000),
      },
    });

    logger.info({ appealId: appeal.id, songId: body.songId, userId: auth.userId }, "moderation: appeal filed");

    return NextResponse.json({ id: appeal.id, status: "pending" }, { status: 201 });
  },
  {
    route: "/api/appeals",
    body: appealBodySchema,
  },
);
