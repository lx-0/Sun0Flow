import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import {
  cached,
  cacheKey,
  CacheTTL,
  invalidateByPrefix,
} from "@/lib/cache";
import { recordActivity } from "@/lib/activity";
import { ownerWhere, memberWhere } from "./access";
import { MAX_PLAYLISTS } from "./constants";
import { success, Err, type PlaylistResult } from "./result";

export async function listPlaylists(userId: string) {
  const playlists = await cached(
    cacheKey("playlists", userId),
    () =>
      prisma.playlist.findMany({
        where: { userId },
        include: { _count: { select: { songs: true } } },
        orderBy: { updatedAt: "desc" },
      }),
    CacheTTL.PLAYLIST,
  );
  return success({ playlists });
}

export async function createPlaylist(
  userId: string,
  input: { name: string; description?: string },
) {
  const count = await prisma.playlist.count({ where: { userId } });
  if (count >= MAX_PLAYLISTS) {
    return Err.limitReached(`Maximum of ${MAX_PLAYLISTS} playlists reached`);
  }

  const playlist = await prisma.playlist.create({
    data: {
      name: stripHtml(input.name).trim(),
      description: input.description
        ? stripHtml(input.description).trim() || null
        : null,
      userId,
    },
    include: { _count: { select: { songs: true } } },
  });

  invalidateByPrefix(cacheKey("playlists", userId));
  recordActivity({
    userId,
    type: "playlist_created",
    playlistId: playlist.id,
  });
  return success({ playlist });
}

export async function getPlaylist(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findFirst({
    where: memberWhere(playlistId, userId),
    include: {
      songs: {
        orderBy: { position: "asc" },
        include: {
          song: true,
          addedByUser: {
            select: { id: true, name: true, image: true, avatarUrl: true },
          },
        },
      },
      _count: { select: { songs: true } },
      collaborators: {
        where: { status: "accepted" },
        include: {
          user: {
            select: { id: true, name: true, image: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!playlist) return Err.notFound();

  const isOwner = playlist.userId === userId;
  return success({ playlist, isOwner });
}

export async function updatePlaylist(
  playlistId: string,
  userId: string,
  input: { name?: string; description?: string | null },
): Promise<PlaylistResult<{ playlist: Awaited<ReturnType<typeof prisma.playlist.update>> }>> {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const data: { name?: string; description?: string | null } = {};

  if (input.name !== undefined) {
    const trimmed = typeof input.name === "string" ? input.name.trim() : "";
    if (trimmed.length === 0) return Err.validation("Name is required");
    if (trimmed.length > 100)
      return Err.validation("Name must be 100 characters or less");
    data.name = trimmed;
  }

  if (input.description !== undefined) {
    if (
      typeof input.description === "string" &&
      input.description.length > 1000
    ) {
      return Err.validation("Description must be 1000 characters or less");
    }
    data.description = input.description?.trim() || null;
  }

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data,
    include: { _count: { select: { songs: true } } },
  });

  invalidateByPrefix(cacheKey("playlists", userId));
  return success({ playlist: updated });
}

export async function deletePlaylist(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  await prisma.playlist.delete({ where: { id: playlist.id } });
  invalidateByPrefix(cacheKey("playlists", userId));
  return success({ success: true as const });
}
