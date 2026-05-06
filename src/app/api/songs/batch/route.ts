import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_BATCH_SIZE = 50;
const VALID_ACTIONS = ["favorite", "unfavorite", "delete", "restore", "permanent_delete", "tag", "add_to_playlist", "make_public", "make_private"] as const;
type BatchAction = (typeof VALID_ACTIONS)[number];

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const { action, songIds, tagId, playlistId } = body as {
      action: string;
      songIds: string[];
      tagId?: string;
      playlistId?: string;
    };

    if (!action || !VALID_ACTIONS.includes(action as BatchAction)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json(
        { error: "songIds must be a non-empty array", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (songIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} songs per batch operation`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify all songs belong to the user
    const userSongs = await prisma.song.findMany({
      where: { id: { in: songIds }, userId },
      select: { id: true },
    });

    const validIds = userSongs.map((s) => s.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid songs found", code: "NOT_FOUND" }, { status: 404 });
    }

    let affected = 0;

    switch (action as BatchAction) {
      case "favorite": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isFavorite: true },
        });
        affected = result.count;
        break;
      }
      case "unfavorite": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isFavorite: false },
        });
        affected = result.count;
        break;
      }
      case "delete": {
        // Soft-delete: set archivedAt and revoke public sharing
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { archivedAt: new Date(), isPublic: false },
        });
        affected = result.count;
        break;
      }
      case "restore": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId, archivedAt: { not: null } },
          data: { archivedAt: null },
        });
        affected = result.count;
        break;
      }
      case "permanent_delete": {
        // Only permanently delete songs that are already archived
        const result = await prisma.song.deleteMany({
          where: { id: { in: validIds }, userId, archivedAt: { not: null } },
        });
        affected = result.count;
        break;
      }
      case "tag": {
        if (!tagId || typeof tagId !== "string") {
          return NextResponse.json(
            { error: "tagId is required for tag action", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }

        // Verify tag belongs to user
        const tag = await prisma.tag.findFirst({
          where: { id: tagId, userId },
        });
        if (!tag) {
          return NextResponse.json({ error: "Tag not found", code: "NOT_FOUND" }, { status: 404 });
        }

        // Get existing song-tag pairs to skip duplicates
        const existing = await prisma.songTag.findMany({
          where: { songId: { in: validIds }, tagId },
          select: { songId: true },
        });
        const existingSet = new Set(existing.map((e) => e.songId));
        const newSongIds = validIds.filter((id) => !existingSet.has(id));

        if (newSongIds.length > 0) {
          await prisma.songTag.createMany({
            data: newSongIds.map((songId) => ({ songId, tagId })),
          });
        }
        affected = newSongIds.length;
        break;
      }
      case "add_to_playlist": {
        if (!playlistId || typeof playlistId !== "string") {
          return NextResponse.json(
            { error: "playlistId is required for add_to_playlist action", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }

        // Verify playlist belongs to user
        const playlist = await prisma.playlist.findFirst({
          where: { id: playlistId, userId },
          include: { _count: { select: { songs: true } } },
        });
        if (!playlist) {
          return NextResponse.json({ error: "Playlist not found", code: "NOT_FOUND" }, { status: 404 });
        }

        // Check capacity
        const maxSongs = 500;
        if (playlist._count.songs + validIds.length > maxSongs) {
          return NextResponse.json(
            { error: `Would exceed maximum of ${maxSongs} songs per playlist`, code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }

        // Get existing songs in playlist to skip duplicates
        const existingPlaylistSongs = await prisma.playlistSong.findMany({
          where: { playlistId, songId: { in: validIds } },
          select: { songId: true },
        });
        const existingPlaylistSet = new Set(existingPlaylistSongs.map((e) => e.songId));
        const newPlaylistSongIds = validIds.filter((id) => !existingPlaylistSet.has(id));

        if (newPlaylistSongIds.length > 0) {
          // Get current max position
          const lastSong = await prisma.playlistSong.findFirst({
            where: { playlistId },
            orderBy: { position: "desc" },
          });
          let nextPosition = lastSong ? lastSong.position + 1 : 0;

          await prisma.playlistSong.createMany({
            data: newPlaylistSongIds.map((songId) => ({
              playlistId,
              songId,
              position: nextPosition++,
            })),
          });
        }
        affected = newPlaylistSongIds.length;
        break;
      }
      case "make_public": {
        // Fetch songs that don't have a publicSlug yet
        const songsNeedingSlug = await prisma.song.findMany({
          where: { id: { in: validIds }, userId, publicSlug: null },
          select: { id: true },
        });
        // Assign slugs for those songs first
        for (const s of songsNeedingSlug) {
          await prisma.song.update({
            where: { id: s.id },
            data: { publicSlug: randomBytes(6).toString("hex") },
          });
        }
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isPublic: true },
        });
        affected = result.count;
        break;
      }
      case "make_private": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isPublic: false },
        });
        affected = result.count;
        break;
      }
    }

    return NextResponse.json({ action, affected, songIds: validIds });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
