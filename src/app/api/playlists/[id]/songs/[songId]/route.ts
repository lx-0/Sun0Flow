import { authRoute, resultResponse } from "@/lib/route-handler";
import { removeSong } from "@/lib/playlists";

export const DELETE = authRoute<{ id: string; songId: string }>(async (_request, { auth, params }) => {
  return resultResponse(await removeSong(params.id, auth.userId, params.songId));
}, { route: "/api/playlists/[id]/songs/[songId]" });
