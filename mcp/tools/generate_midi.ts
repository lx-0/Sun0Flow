/**
 * generate_midi tool — extract MIDI data from a generated track.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { generateMidi, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";

registerTool({
  name: "generate_midi",
  description:
    "Extract MIDI data from a generated song. Returns instrument tracks with note-level data (pitch, start, end, velocity). " +
    "Requires a completed song. Returns a taskId for polling.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID to extract MIDI from.",
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
    if (!song.sunoJobId) throw new Error("Cannot extract MIDI — song has no Suno audio ID.");
    if (song.generationStatus !== "ready") throw new Error("Song must be fully generated before extracting MIDI.");

    const { apiKey: userApiKey } = await resolveUserApiKeyWithMode(userId);

    try {
      const result = await generateMidi({ taskId: song.sunoJobId }, userApiKey);
      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`MIDI extraction failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
