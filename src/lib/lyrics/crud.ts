import { prisma } from "@/lib/prisma";
import { Err, type Result, success } from "@/lib/result";

type LyricAnnotationEntry = {
  lineIndex: number;
  body: string;
};

type LyricTimestampEntry = {
  lineIndex: number;
  startTime: number;
};

async function ensureOwnedSong(songId: string, userId: string): Promise<boolean> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    select: { id: true },
  });
  return song !== null;
}

export async function listLyricAnnotations(
  songId: string,
  userId: string,
): Promise<Result<{ annotations: LyricAnnotationEntry[] }>> {
  const isOwned = await ensureOwnedSong(songId, userId);
  if (!isOwned) return Err.notFound("Not found");

  const annotations = await prisma.lyricAnnotation.findMany({
    where: { songId },
    orderBy: { lineIndex: "asc" },
    select: { lineIndex: true, body: true },
  });

  return success({ annotations });
}

export async function upsertLyricAnnotation(
  songId: string,
  userId: string,
  input: LyricAnnotationEntry,
): Promise<Result<{ ok: true; deleted?: true }>> {
  const isOwned = await ensureOwnedSong(songId, userId);
  if (!isOwned) return Err.notFound("Not found");

  const text = input.body.trim();
  if (!text) {
    await prisma.lyricAnnotation.deleteMany({
      where: { songId, lineIndex: input.lineIndex },
    });
    return success({ ok: true, deleted: true });
  }

  await prisma.lyricAnnotation.upsert({
    where: { songId_lineIndex: { songId, lineIndex: input.lineIndex } },
    create: { songId, lineIndex: input.lineIndex, body: text },
    update: { body: text },
  });

  return success({ ok: true });
}

export async function listLyricTimestamps(
  songId: string,
  userId: string,
): Promise<Result<{ timestamps: LyricTimestampEntry[] }>> {
  const isOwned = await ensureOwnedSong(songId, userId);
  if (!isOwned) return Err.notFound("Not found");

  const timestamps = await prisma.lyricTimestamp.findMany({
    where: { songId },
    orderBy: { lineIndex: "asc" },
    select: { lineIndex: true, startTime: true },
  });

  return success({ timestamps });
}

export async function replaceLyricTimestamps(
  songId: string,
  userId: string,
  entries: LyricTimestampEntry[],
): Promise<Result<{ ok: true }>> {
  const isOwned = await ensureOwnedSong(songId, userId);
  if (!isOwned) return Err.notFound("Not found");

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.lyricTimestamp.upsert({
        where: { songId_lineIndex: { songId, lineIndex: entry.lineIndex } },
        create: { songId, lineIndex: entry.lineIndex, startTime: entry.startTime },
        update: { startTime: entry.startTime },
      }),
    ),
  );

  return success({ ok: true });
}
