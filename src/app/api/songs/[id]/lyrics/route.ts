import { authRoute, resultResponse } from "@/lib/route-handler";
import { getSongLyrics, updateSongLyrics } from "@/lib/songs";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getSongLyrics(params.id, auth.userId));
}, { route: "/api/songs/[id]/lyrics" });

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(
    await updateSongLyrics(params.id, auth.userId, { edited: body.edited }),
  );
}, { route: "/api/songs/[id]/lyrics" });
