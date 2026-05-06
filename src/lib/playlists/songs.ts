import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { editorWhere, ownerWhere } from "./access";
import { MAX_SONGS_PER_PLAYLIST } from "./constants";
import { success, Err } from "./result";

export async function addSong(
  playlistId: string,
  userId: string,
  songId: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: editorWhere(playlistId, userId),
    include: { _count: { select: { songs: true } } },
  });
  if (!playlist) return Err.notFound();

  if (!songId || typeof songId !== "string") {
    return Err.validation("songId is required");
  }

  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
  });
  if (!song) return Err.notFound("Song not found");

  if (playlist._count.songs >= MAX_SONGS_PER_PLAYLIST) {
    return Err.validation(
      `Maximum of ${MAX_SONGS_PER_PLAYLIST} songs per playlist`,
    );
  }

  const existing = await prisma.playlistSong.findUnique({
    where: { playlistId_songId: { playlistId: playlist.id, songId } },
  });
  if (existing) return Err.validation("Song already in playlist");

  const lastSong = await prisma.playlistSong.findFirst({
    where: { playlistId: playlist.id },
    orderBy: { position: "desc" },
  });

  const playlistSong = await prisma.playlistSong.create({
    data: {
      playlistId: playlist.id,
      songId,
      position: lastSong ? lastSong.position + 1 : 0,
      addedByUserId: userId,
    },
    include: {
      song: true,
      addedByUser: {
        select: { id: true, name: true, image: true, avatarUrl: true },
      },
    },
  });

  if (playlist.isCollaborative) {
    recordActivity({
      userId,
      type: "song_added_to_playlist",
      songId,
      playlistId: playlist.id,
      metadata: { songTitle: song.title ?? undefined },
    });
  }

  return success({ playlistSong });
}

export async function removeSong(
  playlistId: string,
  userId: string,
  songId: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: editorWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const playlistSong = await prisma.playlistSong.findUnique({
    where: {
      playlistId_songId: { playlistId: playlist.id, songId },
    },
    include: { song: { select: { title: true } } },
  });
  if (!playlistSong) return Err.notFound("Song not in playlist");

  const isOwner = playlist.userId === userId;
  if (!isOwner && playlistSong.addedByUserId !== userId) {
    return Err.forbidden("You can only remove songs you added");
  }

  await prisma.playlistSong.delete({ where: { id: playlistSong.id } });

  const remaining = await prisma.playlistSong.findMany({
    where: { playlistId: playlist.id },
    orderBy: { position: "asc" },
  });
  await Promise.all(
    remaining.map((ps, i) =>
      prisma.playlistSong.update({
        where: { id: ps.id },
        data: { position: i },
      }),
    ),
  );

  if (playlist.isCollaborative) {
    recordActivity({
      userId,
      type: "song_removed_from_playlist",
      songId,
      playlistId: playlist.id,
      metadata: { songTitle: playlistSong.song?.title ?? undefined },
    });
  }

  return success({ success: true as const });
}

export async function reorderSongs(
  playlistId: string,
  userId: string,
  songIds: string[],
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  if (!Array.isArray(songIds)) {
    return Err.validation("songIds array is required");
  }

  const existing = await prisma.playlistSong.findMany({
    where: { playlistId: playlist.id },
  });
  const existingSongIds = new Set(existing.map((ps) => ps.songId));
  const valid = songIds.every((id: string) => existingSongIds.has(id));

  if (!valid || songIds.length !== existing.length) {
    return Err.validation("songIds must match all songs in the playlist");
  }

  await prisma.$transaction(
    songIds.map((songId: string, index: number) =>
      prisma.playlistSong.update({
        where: {
          playlistId_songId: { playlistId: playlist.id, songId },
        },
        data: { position: index },
      }),
    ),
  );

  return success({ success: true as const });
}
