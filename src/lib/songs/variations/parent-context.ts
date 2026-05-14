import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { MAX_VARIATIONS } from "@/lib/songs/variations/constants";
import { type Result, success, Err } from "@/lib/result";

export async function resolveRootId(songId: string, parentSongId: string | null): Promise<string> {
  if (!parentSongId) return songId;

  let rootId = parentSongId;
  let current = await prisma.song.findUnique({
    where: { id: rootId },
    select: { parentSongId: true },
  });

  while (current?.parentSongId) {
    rootId = current.parentSongId;
    current = await prisma.song.findUnique({
      where: { id: rootId },
      select: { parentSongId: true },
    });
  }

  return rootId;
}

export interface ParentContext {
  parentSong: NonNullable<Awaited<ReturnType<typeof prisma.song.findUnique>>>;
  rootId: string;
  userApiKey: string | undefined;
  hasApiKey: boolean;
}

export async function resolveParent(userId: string, parentSongId: string): Promise<Result<ParentContext>> {
  const parentSong = await prisma.song.findUnique({ where: { id: parentSongId } });
  if (!parentSong || parentSong.userId !== userId) {
    return Err.notFound("Song not found");
  }

  const rootId = parentSong.parentSongId ?? parentSongId;
  const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
  if (variationCount >= MAX_VARIATIONS) {
    return Err.limitReached(`Maximum ${MAX_VARIATIONS} variations per song reached.`);
  }

  const userApiKey = await resolveUserApiKey(userId);
  const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

  return success({ parentSong, rootId, userApiKey, hasApiKey });
}
