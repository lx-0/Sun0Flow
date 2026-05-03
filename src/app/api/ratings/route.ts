import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { notFound } from "@/lib/api-error";

export const GET = authRoute(async (request, { auth }) => {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("songId");

  const where: { userId: string; songId?: string } = { userId: auth.userId };
  if (songId) {
    where.songId = songId;
  }

  const ratings = await prisma.rating.findMany({
    where,
    select: {
      id: true,
      songId: true,
      value: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ ratings });
}, { route: "/api/ratings" });

const createRatingBody = z.object({
  songId: z.string().min(1, "songId is required"),
  value: z.number().int().min(1).max(5, "value must be an integer between 1 and 5"),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  const song = await prisma.song.findUnique({
    where: { id: body.songId },
    select: { id: true },
  });

  if (!song) {
    return notFound("Song not found");
  }

  const rating = await prisma.rating.upsert({
    where: {
      userId_songId: { userId: auth.userId, songId: body.songId },
    },
    create: {
      userId: auth.userId,
      songId: body.songId,
      value: body.value,
    },
    update: {
      value: body.value,
    },
  });

  invalidateByPrefix(`dashboard-stats:${auth.userId}`);

  return NextResponse.json({
    id: rating.id,
    songId: rating.songId,
    value: rating.value,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt,
  });
}, { route: "/api/ratings", body: createRatingBody });
