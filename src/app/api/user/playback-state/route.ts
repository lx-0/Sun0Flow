import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const putPlaybackStateBody = z.object({
  songId: z.string().min(1, "songId is required"),
  position: z.number().min(0, "position must be a non-negative number"),
  queue: z.array(z.any()),
  volume: z.number().optional(),
  shuffleVersions: z.boolean().optional(),
  shuffle: z.boolean().optional(),
  repeat: z.enum(["off", "repeat-all", "repeat-one"]).optional(),
  muted: z.boolean().optional(),
});

export const GET = authRoute(async (_request, { auth }) => {
  const state = await prisma.playbackState.findUnique({
    where: { userId: auth.userId },
    include: {
      song: {
        select: {
          id: true,
          title: true,
          audioUrl: true,
          imageUrl: true,
          duration: true,
          lyrics: true,
        },
      },
    },
  });

  if (!state) {
    return NextResponse.json({ state: null });
  }

  return NextResponse.json({ state });
}, { route: "/api/user/playback-state" });

export const PUT = authRoute(async (_request, { auth, body }) => {
  const song = await prisma.song.findFirst({
    where: { id: body.songId, userId: auth.userId },
    select: { id: true },
  });
  if (!song) return notFound("Song not found");

  const volume = body.volume !== undefined ? Math.max(0, Math.min(1, body.volume)) : 1;

  const state = await prisma.playbackState.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      songId: body.songId,
      position: body.position,
      queue: body.queue,
      volume,
      shuffleVersions: body.shuffleVersions === true,
      shuffle: body.shuffle === true,
      repeat: body.repeat ?? "off",
      muted: body.muted === true,
    },
    update: {
      songId: body.songId,
      position: body.position,
      queue: body.queue,
      volume,
      shuffleVersions: body.shuffleVersions === true,
      shuffle: body.shuffle === true,
      repeat: body.repeat ?? "off",
      muted: body.muted === true,
    },
  });

  return NextResponse.json({ state });
}, { route: "/api/user/playback-state", body: putPlaybackStateBody });
