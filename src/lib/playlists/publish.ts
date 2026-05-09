import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  invalidateKey,
  invalidateByPrefix,
  cacheKey,
} from "@/lib/cache";
import { ownerWhere } from "./access";
import { MAX_PLAYLISTS } from "./constants";
import { success, Err } from "./result";

export async function togglePublish(
  playlistId: string,
  userId: string,
  genre?: string | null,
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
    include: { _count: { select: { songs: true } } },
  });
  if (!playlist) return Err.notFound();

  const newIsPublished = !playlist.isPublished;

  if (newIsPublished && playlist._count.songs === 0) {
    return Err.validation("Playlist must have at least 1 song to publish");
  }

  const slug = newIsPublished
    ? playlist.slug ?? randomBytes(6).toString("hex")
    : playlist.slug;

  const data: Record<string, unknown> = {
    isPublished: newIsPublished,
    slug,
  };

  if (newIsPublished) {
    data.isPublic = true;
    if (!playlist.publishedAt) {
      data.publishedAt = new Date();
    }
    if (genre !== undefined && genre !== null) {
      data.genre = genre;
    }
  }

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data,
  });

  if (updated.slug) {
    invalidateKey(cacheKey("public-playlist", updated.slug));
  }
  invalidateByPrefix(cacheKey("playlists", userId));

  return success({
    isPublished: updated.isPublished,
    publishedAt: updated.publishedAt,
    genre: updated.genre,
    slug: updated.slug,
    isPublic: updated.isPublic,
  });
}

export async function toggleShare(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const newIsPublic = !playlist.isPublic;
  const slug = newIsPublic
    ? playlist.slug ?? randomBytes(6).toString("hex")
    : playlist.slug;

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data: {
      isPublic: newIsPublic,
      slug,
      shareCount: newIsPublic ? { increment: 1 } : playlist.shareCount,
    },
  });

  if (updated.slug) {
    invalidateKey(cacheKey("public-playlist", updated.slug));
  }

  return success({
    isPublic: updated.isPublic,
    slug: updated.slug,
  });
}

export async function copyPlaylist(sourcePlaylistId: string, userId: string) {
  const source = await prisma.playlist.findFirst({
    where: { id: sourcePlaylistId, isPublic: true },
    include: {
      songs: {
        orderBy: { position: "asc" },
        select: { songId: true, position: true },
      },
    },
  });
  if (!source) return Err.notFound();

  if (source.userId === userId) {
    return Err.validation("Cannot copy your own playlist");
  }

  const playlistCount = await prisma.playlist.count({ where: { userId } });
  if (playlistCount >= MAX_PLAYLISTS) {
    return Err.limitReached(`Playlist limit reached (${MAX_PLAYLISTS})`);
  }

  const copy = await prisma.$transaction(async (tx) => {
    const newPlaylist = await tx.playlist.create({
      data: {
        name: source.name,
        description: source.description,
        userId,
        isPublic: false,
      },
    });

    if (source.songs.length > 0) {
      await tx.playlistSong.createMany({
        data: source.songs.map((ps) => ({
          playlistId: newPlaylist.id,
          songId: ps.songId,
          position: ps.position,
        })),
        skipDuplicates: true,
      });
    }

    return newPlaylist;
  });

  invalidateByPrefix(cacheKey("playlists", userId));
  return success({ playlist: { id: copy.id, name: copy.name } });
}

export async function recordPlay(playlistId: string) {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, isPublic: true },
  });

  if (!playlist || !playlist.isPublic) {
    return Err.notFound("Playlist not found");
  }

  await prisma.playlist.update({
    where: { id: playlistId },
    data: { playCount: { increment: 1 } },
  });

  return success({ ok: true as const });
}
