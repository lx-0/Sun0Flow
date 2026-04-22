/**
 * convert_to_wav tool — convert a generated track to lossless WAV format.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { convertToWav, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";

registerTool({
  name: "convert_to_wav",
  description:
    "Convert a generated song to lossless WAV format. Returns a taskId — the WAV download URL is available once conversion completes.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID to convert to WAV.",
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
    if (!song.sunoJobId) throw new Error("Cannot convert — song has no Suno audio ID.");
    if (song.generationStatus !== "ready") throw new Error("Song must be fully generated before converting.");

    const { apiKey: userApiKey } = await resolveUserApiKeyWithMode(userId);

    try {
      const result = await convertToWav(
        { taskId: song.sunoJobId, audioId: song.sunoJobId },
        userApiKey
      );

      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`WAV conversion failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
