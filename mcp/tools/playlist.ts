/**
 * Playlist tools: create_playlist and add_to_playlist.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";

const MAX_PLAYLISTS = 50;
const MAX_SONGS_PER_PLAYLIST = 500;

registerTool({
  name: "create_playlist",
  description: "Create a new playlist in the user's library.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Playlist name (max 100 chars). Required.",
        maxLength: 100,
      },
      description: {
        type: "string",
        description: "Optional playlist description (max 1000 chars).",
        maxLength: 1000,
      },
    },
    required: ["name"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { name, description } = input as {
      name: string;
      description?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new Error("name is required");
    }

    const cleanName = stripHtml(name).trim();
    if (cleanName.length > 100) {
      throw new Error("name must be 100 characters or less");
    }

    const count = await prisma.playlist.count({ where: { userId } });
    if (count >= MAX_PLAYLISTS) {
      throw new Error(`Maximum of ${MAX_PLAYLISTS} playlists reached`);
    }

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: cleanName,
        description: description ? stripHtml(description).trim() || null : null,
      },
      select: { id: true, name: true, description: true, createdAt: true },
    });

    return { playlist };
  },
});

registerTool({
  name: "add_to_playlist",
  description: "Add a song to an existing playlist.",
  inputSchema: {
    type: "object",
    properties: {
      playlistId: {
        type: "string",
        description: "The playlist ID to add the song to.",
      },
      songId: {
        type: "string",
        description: "The song ID to add.",
      },
    },
    required: ["playlistId", "songId"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { playlistId, songId } = input as {
      playlistId: string;
      songId: string;
    };

    if (!playlistId || !songId) {
      throw new Error("playlistId and songId are required");
    }

    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, userId },
      include: { _count: { select: { songs: true } } },
    });

    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistId}`);
    }

    if (playlist._count.songs >= MAX_SONGS_PER_PLAYLIST) {
      throw new Error(`Maximum of ${MAX_SONGS_PER_PLAYLIST} songs per playlist`);
    }

    const song = await prisma.song.findFirst({ where: { id: songId, userId } });
    if (!song) {
      throw new Error(`Song not found: ${songId}`);
    }

    const existing = await prisma.playlistSong.findUnique({
      where: { playlistId_songId: { playlistId, songId } },
    });

    if (existing) {
      return { alreadyInPlaylist: true, playlistId, songId };
    }

    const lastSong = await prisma.playlistSong.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" },
    });
    const position = lastSong ? lastSong.position + 1 : 0;

    await prisma.playlistSong.create({
      data: { playlistId, songId, position, addedByUserId: userId },
    });

    return { added: true, playlistId, songId, position };
  },
});
