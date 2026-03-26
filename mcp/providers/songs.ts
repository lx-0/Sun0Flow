/**
 * Resource provider: sunoflow://songs/{id}
 * Returns song metadata, lyrics, and generation params.
 */

import { registerTemplateResource } from "../resources";
import { prisma } from "@/lib/prisma";

const URI_PREFIX = "sunoflow://songs/";

registerTemplateResource({
  uriTemplate: "sunoflow://songs/{id}",
  name: "Song",
  description: "Song metadata, audio URL, lyrics, and generation parameters for a single song.",
  mimeType: "application/json",

  match(uri: string) {
    if (!uri.startsWith(URI_PREFIX)) return null;
    const id = uri.slice(URI_PREFIX.length);
    if (!id) return null;
    return { id };
  },

  async resolve(uri, params, userId) {
    const song = await prisma.song.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true,
        title: true,
        prompt: true,
        tags: true,
        audioUrl: true,
        imageUrl: true,
        duration: true,
        lyrics: true,
        generationStatus: true,
        isInstrumental: true,
        sunoModel: true,
        rating: true,
        playCount: true,
        createdAt: true,
      },
    });

    if (!song) {
      throw new Error(`Song not found: ${params.id}`);
    }

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(song, null, 2),
    };
  },
});
