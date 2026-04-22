/**
 * separate_vocals tool — separate a track into vocal and instrumental stems.
 * Returns a taskId for polling status.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { separateVocals, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";

registerTool({
  name: "separate_vocals",
  description:
    "Separate a song into vocal and instrumental tracks (stem separation). " +
    "Two modes: 'separate_vocal' returns vocal + instrumental (10 credits), " +
    "'split_stem' returns full multi-stem separation including drums, bass, guitar, etc. (50 credits). " +
    "Returns a taskId — the result URLs are available once processing completes.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID to separate vocals from.",
      },
      type: {
        type: "string",
        enum: ["separate_vocal", "split_stem"],
        description:
          "'separate_vocal': splits into vocal + instrumental (10 credits). " +
          "'split_stem': full stem separation — drums, bass, guitar, keyboard, percussion, strings, synth, fx, brass, woodwinds (50 credits).",
      },
    },
    required: ["songId", "type"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { songId, type } = input as { songId: string; type: string };

    if (!songId) throw new Error("songId is required");
    if (!type || !["separate_vocal", "split_stem"].includes(type)) {
      throw new Error("type must be 'separate_vocal' or 'split_stem'");
    }

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { sunoJobId: true, generationStatus: true },
    });
    if (!song) throw new Error(`Song not found: ${songId}`);
    if (!song.sunoJobId) throw new Error("Cannot separate vocals — song has no Suno audio ID.");
    if (song.generationStatus !== "ready") throw new Error("Song must be fully generated (status 'ready') before separating.");

    const { apiKey: userApiKey } = await resolveUserApiKeyWithMode(userId);

    try {
      const result = await separateVocals(
        {
          taskId: song.sunoJobId,
          audioId: song.sunoJobId,
          type: type as "separate_vocal" | "split_stem",
        },
        userApiKey
      );

      return {
        taskId: result.taskId,
        type,
        status: "pending",
        note: type === "split_stem"
          ? "Full stem separation in progress. Results include: drums, bass, guitar, keyboard, percussion, strings, synth, fx, brass, woodwinds."
          : "Vocal separation in progress. Results include: vocal track, instrumental track.",
      };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Vocal separation failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
