/**
 * get_song tool — retrieve full song details by ID.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";

registerTool({
  name: "get_song",
  description:
    "Retrieve full details for a song including play URL, metadata, and lyrics. Use after generate_song to poll until generationStatus === 'ready'.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID returned by generate_song or list_songs.",
      },
    },
    required: ["songId"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { songId } = input as { songId: string };

    if (!songId || typeof songId !== "string") {
      throw new Error("songId is required");
    }

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
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
        errorMessage: true,
        isInstrumental: true,
        sunoModel: true,
        playCount: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!song) {
      throw new Error(`Song not found: ${songId}`);
    }

    return { song };
  },
});
