import { prisma } from "@/lib/prisma";
import { type AnalyticsResult, success, Err } from "./result";

export interface PlayResult {
  ok: true;
  eventId?: string;
  skipped?: boolean;
}

export async function recordPlay(
  userId: string,
  songId: string,
  durationSec: unknown,
): Promise<AnalyticsResult<PlayResult>> {
  if (!songId || typeof songId !== "string") {
    return Err.validation("songId is required");
  }

  const song = await prisma.song.findFirst({
    where: {
      id: songId,
      OR: [{ userId }, { isPublic: true }],
    },
    select: { id: true, userId: true },
  });

  if (!song) return Err.notFound("Song not found");

  if (song.userId === userId) {
    return success({ ok: true, skipped: true });
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

  return success({ ok: true, eventId: event.id });
}

export async function recordView(
  songId: string,
): Promise<AnalyticsResult<{ ok: true }>> {
  if (!songId || typeof songId !== "string") {
    return Err.validation("songId is required");
  }

  const song = await prisma.song.findFirst({
    where: { id: songId, isPublic: true, isHidden: false, archivedAt: null },
    select: { id: true },
  });

  if (!song) return Err.notFound("Song not found");

  await prisma.$transaction([
    prisma.songView.create({ data: { songId } }),
    prisma.song.update({
      where: { id: songId },
      data: { viewCount: { increment: 1 } },
    }),
  ]);

  return success({ ok: true });
}
