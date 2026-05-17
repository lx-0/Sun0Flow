import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { getSongRating, updateSongRating } from "@/lib/songs";

const patchBodySchema = z.object({
  stars: z.number(),
  note: z.string().nullable().optional(),
});

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getSongRating(params.id, auth.userId));
}, { route: "/api/songs/[id]/rating" });

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchBodySchema>>(async (
  _request,
  { auth, params, body },
) => {
  return resultResponse(
    await updateSongRating(params.id, auth.userId, {
      stars: body.stars,
      note: body.note,
    }),
  );
}, {
  route: "/api/songs/[id]/rating",
  body: patchBodySchema,
});
