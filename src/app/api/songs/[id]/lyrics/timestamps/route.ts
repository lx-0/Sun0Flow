import { z } from "zod";
import { listLyricTimestamps, replaceLyricTimestamps } from "@/lib/lyrics";
import { authRoute, resultResponse } from "@/lib/route-handler";

const timestampEntry = z.object({
  lineIndex: z.number(),
  startTime: z.number(),
});

const replaceTimestampsBody = z.object({
  timestamps: z.array(timestampEntry),
});

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) =>
    resultResponse(await listLyricTimestamps(params.id, auth.userId)),
  { route: "/api/songs/[id]/lyrics/timestamps" },
);

export const PUT = authRoute<{ id: string }, z.infer<typeof replaceTimestampsBody>>(
  async (_request, { auth, params, body }) =>
    resultResponse(await replaceLyricTimestamps(params.id, auth.userId, body.timestamps)),
  { route: "/api/songs/[id]/lyrics/timestamps", body: replaceTimestampsBody },
);
