import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { MAX_SONGS_PER_PLAYLIST } from "@/lib/playlists/constants";

const MAX_BATCH_SIZE = 50;

const VALID_ACTIONS = [
  "favorite",
  "unfavorite",
  "delete",
  "restore",
  "permanent_delete",
  "tag",
  "add_to_playlist",
  "make_public",
  "make_private",
] as const;

export type BatchAction = (typeof VALID_ACTIONS)[number];

export interface BatchParams {
  action: string;
  songIds: string[];
  tagId?: string;
  playlistId?: string;
}

export type BatchResult =
  | { ok: true; action: BatchAction; affected: number; songIds: string[] }
  | { ok: false; error: string; code: string; status: number };

function fail(error: string, code: string, status: number): BatchResult {
  return { ok: false, error, code, status };
}

export async function executeBatch(
  userId: string,
  params: BatchParams,
): Promise<BatchResult> {
  const { action, songIds, tagId, playlistId } = params;

  if (!action || !VALID_ACTIONS.includes(action as BatchAction)) {
    return fail(
      `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      "VALIDATION_ERROR",
      400,
    );
  }

  if (!Array.isArray(songIds) || songIds.length === 0) {
    return fail("songIds must be a non-empty array", "VALIDATION_ERROR", 400);
  }

  if (songIds.length > MAX_BATCH_SIZE) {
    return fail(
      `Maximum ${MAX_BATCH_SIZE} songs per batch operation`,
      "VALIDATION_ERROR",
      400,
    );
  }

  const userSongs = await prisma.song.findMany({
    where: { id: { in: songIds }, userId },
    select: { id: true },
  });

  const validIds = userSongs.map((s) => s.id);
  if (validIds.length === 0) {
    return fail("No valid songs found", "NOT_FOUND", 404);
  }

  const typedAction = action as BatchAction;
  let affected: number;

  switch (typedAction) {
    case "favorite":
      affected = await batchFavorite(validIds, userId, true);
      break;
    case "unfavorite":
      affected = await batchFavorite(validIds, userId, false);
      break;
    case "delete":
      affected = await batchSoftDelete(validIds, userId);
      break;
    case "restore":
      affected = await batchRestore(validIds, userId);
      break;
    case "permanent_delete":
      affected = await batchPermanentDelete(validIds, userId);
      break;
    case "tag": {
      const result = await batchTag(validIds, userId, tagId);
      if (!result.ok) return result;
      affected = result.affected;
      break;
    }
    case "add_to_playlist": {
      const result = await batchAddToPlaylist(validIds, userId, playlistId);
      if (!result.ok) return result;
      affected = result.affected;
      break;
    }
    case "make_public":
      affected = await batchMakePublic(validIds, userId);
      break;
    case "make_private":
      affected = await batchMakePrivate(validIds, userId);
      break;
  }

  return { ok: true, action: typedAction, affected, songIds: validIds };
}

// ---------------------------------------------------------------------------
// Action implementations
// ---------------------------------------------------------------------------

async function batchFavorite(
  songIds: string[],
  userId: string,
  isFavorite: boolean,
): Promise<number> {
  const result = await prisma.song.updateMany({
    where: { id: { in: songIds }, userId },
    data: { isFavorite },
  });
  return result.count;
}

async function batchSoftDelete(
  songIds: string[],
  userId: string,
): Promise<number> {
  const result = await prisma.song.updateMany({
    where: { id: { in: songIds }, userId },
    data: { archivedAt: new Date(), isPublic: false },
  });
  return result.count;
}

async function batchRestore(
  songIds: string[],
  userId: string,
): Promise<number> {
  const result = await prisma.song.updateMany({
    where: { id: { in: songIds }, userId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  return result.count;
}

async function batchPermanentDelete(
  songIds: string[],
  userId: string,
): Promise<number> {
  const result = await prisma.song.deleteMany({
    where: { id: { in: songIds }, userId, archivedAt: { not: null } },
  });
  return result.count;
}

async function batchTag(
  songIds: string[],
  userId: string,
  tagId: string | undefined,
): Promise<BatchResult | { ok: true; affected: number }> {
  if (!tagId || typeof tagId !== "string") {
    return fail("tagId is required for tag action", "VALIDATION_ERROR", 400);
  }

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, userId },
  });
  if (!tag) {
    return fail("Tag not found", "NOT_FOUND", 404);
  }

  const existing = await prisma.songTag.findMany({
    where: { songId: { in: songIds }, tagId },
    select: { songId: true },
  });
  const existingSet = new Set(existing.map((e) => e.songId));
  const newSongIds = songIds.filter((id) => !existingSet.has(id));

  if (newSongIds.length > 0) {
    await prisma.songTag.createMany({
      data: newSongIds.map((songId) => ({ songId, tagId })),
    });
  }

  return { ok: true, affected: newSongIds.length };
}

async function batchAddToPlaylist(
  songIds: string[],
  userId: string,
  playlistId: string | undefined,
): Promise<BatchResult | { ok: true; affected: number }> {
  if (!playlistId || typeof playlistId !== "string") {
    return fail(
      "playlistId is required for add_to_playlist action",
      "VALIDATION_ERROR",
      400,
    );
  }

  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    include: { _count: { select: { songs: true } } },
  });
  if (!playlist) {
    return fail("Playlist not found", "NOT_FOUND", 404);
  }

  if (playlist._count.songs + songIds.length > MAX_SONGS_PER_PLAYLIST) {
    return fail(
      `Would exceed maximum of ${MAX_SONGS_PER_PLAYLIST} songs per playlist`,
      "VALIDATION_ERROR",
      400,
    );
  }

  const existingPlaylistSongs = await prisma.playlistSong.findMany({
    where: { playlistId, songId: { in: songIds } },
    select: { songId: true },
  });
  const existingSet = new Set(existingPlaylistSongs.map((e) => e.songId));
  const newSongIds = songIds.filter((id) => !existingSet.has(id));

  if (newSongIds.length > 0) {
    const lastSong = await prisma.playlistSong.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" },
    });
    let nextPosition = lastSong ? lastSong.position + 1 : 0;

    await prisma.playlistSong.createMany({
      data: newSongIds.map((songId) => ({
        playlistId,
        songId,
        position: nextPosition++,
      })),
    });
  }

  return { ok: true, affected: newSongIds.length };
}

async function batchMakePublic(
  songIds: string[],
  userId: string,
): Promise<number> {
  const songsNeedingSlug = await prisma.song.findMany({
    where: { id: { in: songIds }, userId, publicSlug: null },
    select: { id: true },
  });

  for (const s of songsNeedingSlug) {
    await prisma.song.update({
      where: { id: s.id },
      data: { publicSlug: randomBytes(6).toString("hex") },
    });
  }

  const result = await prisma.song.updateMany({
    where: { id: { in: songIds }, userId },
    data: { isPublic: true },
  });
  return result.count;
}

async function batchMakePrivate(
  songIds: string[],
  userId: string,
): Promise<number> {
  const result = await prisma.song.updateMany({
    where: { id: { in: songIds }, userId },
    data: { isPublic: false },
  });
  return result.count;
}
