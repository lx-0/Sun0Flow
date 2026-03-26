/**
 * Resource provider: sunoflow://playlists/{id}
 * Returns playlist details with full track listing.
 */

import { registerTemplateResource } from "../resources";
import { prisma } from "@/lib/prisma";

const URI_PREFIX = "sunoflow://playlists/";

registerTemplateResource({
  uriTemplate: "sunoflow://playlists/{id}",
  name: "Playlist",
  description: "Playlist metadata and ordered track listing.",
  mimeType: "application/json",

  match(uri: string) {
    if (!uri.startsWith(URI_PREFIX)) return null;
    const id = uri.slice(URI_PREFIX.length);
    if (!id) return null;
    return { id };
  },

  async resolve(uri, params, userId) {
    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        songs: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            addedAt: true,
            song: {
              select: {
                id: true,
                title: true,
                tags: true,
                audioUrl: true,
                duration: true,
                generationStatus: true,
              },
            },
          },
        },
        _count: { select: { songs: true } },
      },
    });

    if (!playlist) {
      throw new Error(`Playlist not found: ${params.id}`);
    }

    const { _count, songs, ...meta } = playlist;
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          ...meta,
          trackCount: _count.songs,
          tracks: songs.map((ps) => ({
            position: ps.position,
            addedAt: ps.addedAt,
            ...ps.song,
          })),
        },
        null,
        2
      ),
    };
  },
});
