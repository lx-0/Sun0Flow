/**
 * generate_cover_image tool — generate cover art for a completed song.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { generateCoverImage, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";

registerTool({
  name: "generate_cover_image",
  description:
    "Generate AI cover art images for a completed song. Produces 2 different style images. " +
    "Images are retained for 14 days. Returns a taskId for polling.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID to generate cover art for.",
      },
    },
    required: ["songId"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { songId } = input as { songId: string };

    if (!songId) throw new Error("songId is required");

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { sunoJobId: true, generationStatus: true },
    });
    if (!song) throw new Error(`Song not found: ${songId}`);
    if (!song.sunoJobId) throw new Error("Cannot generate cover — song has no Suno audio ID.");
    if (song.generationStatus !== "ready") throw new Error("Song must be fully generated before generating cover art.");

    const { apiKey: userApiKey } = await resolveUserApiKeyWithMode(userId);

    try {
      const result = await generateCoverImage({ taskId: song.sunoJobId }, userApiKey);
      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Cover image generation failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
