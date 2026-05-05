import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { songRoute } from "@/lib/route-handler";
import { invalidateByPrefix } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";

export const GET = songRoute(async (_request, { auth, song }) => {
  const existing = await prisma.favorite.findUnique({
    where: { userId_songId: { userId: auth.userId, songId: song.id } },
  });

  return NextResponse.json({ isFavorite: !!existing });
}, { access: "accessible", route: "/api/songs/[id]/favorite" });

export const POST = songRoute(async (_request, { auth, song }) => {
  const favorite = await prisma.favorite.upsert({
    where: { userId_songId: { userId: auth.userId, songId: song.id } },
    create: { userId: auth.userId, songId: song.id },
    update: {},
  });

  const count = await prisma.favorite.count({ where: { songId: song.id } });

  invalidateByPrefix(`dashboard-stats:${auth.userId}`);
  recordActivity({ userId: auth.userId, type: "song_favorited", songId: song.id });

  return NextResponse.json({ isFavorite: true, favoriteCount: count, favoriteId: favorite.id });
}, { access: "accessible", route: "/api/songs/[id]/favorite" });

export const DELETE = songRoute(async (_request, { auth, song }) => {
  await prisma.favorite.deleteMany({
    where: { userId: auth.userId, songId: song.id },
  });

  const count = await prisma.favorite.count({ where: { songId: song.id } });

  invalidateByPrefix(`dashboard-stats:${auth.userId}`);

  return NextResponse.json({ isFavorite: false, favoriteCount: count });
}, { access: "accessible", route: "/api/songs/[id]/favorite" });
