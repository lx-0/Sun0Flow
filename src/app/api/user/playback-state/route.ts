import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const putPlaybackStateBody = z.object({
  songId: z.string().min(1, "songId is required"),
  position: z.number().min(0, "position must be a non-negative number"),
  queue: z.array(z.unknown(), "queue must be an array"),
  volume: z.number().optional(),
  shuffleVersions: z.boolean().optional(),
  shuffle: z.boolean().optional(),
  repeat: z.enum(["off", "repeat-all", "repeat-one"]).optional(),
  muted: z.boolean().optional(),
  eqGains: z.array(z.number()).optional(),
  eqSpeed: z.number().optional(),
  eqPitch: z.number().optional(),
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
  const validEqGains = Array.isArray(body.eqGains) && body.eqGains.length === 5
    ? body.eqGains
    : [0, 0, 0, 0, 0];
  const validEqSpeed = body.eqSpeed !== undefined && body.eqSpeed >= 0.5 && body.eqSpeed <= 2
    ? body.eqSpeed
    : 1;
  const validEqPitch = body.eqPitch !== undefined && body.eqPitch >= -6 && body.eqPitch <= 6
    ? body.eqPitch
    : 0;

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
      eqGains: validEqGains,
      eqSpeed: validEqSpeed,
      eqPitch: validEqPitch,
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
      eqGains: validEqGains,
      eqSpeed: validEqSpeed,
      eqPitch: validEqPitch,
    },
  });

  return NextResponse.json({ state });
}, { route: "/api/user/playback-state", body: putPlaybackStateBody });
