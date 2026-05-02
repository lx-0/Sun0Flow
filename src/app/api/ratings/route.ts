import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { badRequest, notFound } from "@/lib/api-error";

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

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const { songId, value } = body;

  if (!songId || typeof songId !== "string") {
    return badRequest("songId is required");
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    return badRequest("value must be an integer between 1 and 5");
  }

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true },
  });

  if (!song) {
    return notFound("Song not found");
  }

  const rating = await prisma.rating.upsert({
    where: {
      userId_songId: { userId: auth.userId, songId },
    },
    create: {
      userId: auth.userId,
      songId,
      value,
    },
    update: {
      value,
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
}, { route: "/api/ratings" });
