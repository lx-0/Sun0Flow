import { authRoute, resultResponse } from "@/lib/route-handler";
import { getSongRating, updateSongRating } from "@/lib/songs/crud";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getSongRating(params.id, auth.userId));
}, { route: "/api/songs/[id]/rating" });

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(
    await updateSongRating(params.id, auth.userId, {
      stars: body.stars,
      note: body.note,
    }),
  );
}, { route: "/api/songs/[id]/rating" });
