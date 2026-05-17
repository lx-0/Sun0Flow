import { authRoute, resultResponse } from "@/lib/route-handler";
import { getSongLyrics, updateSongLyrics } from "@/lib/songs";
import { z } from "zod";

const patchBodySchema = z.object({
  edited: z.string().nullable().optional(),
});

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getSongLyrics(params.id, auth.userId));
}, { route: "/api/songs/[id]/lyrics" });

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchBodySchema>>(async (
  _request,
  { auth, params, body },
) => {
  return resultResponse(
    await updateSongLyrics(params.id, auth.userId, { edited: body.edited }),
  );
}, { route: "/api/songs/[id]/lyrics", body: patchBodySchema });
