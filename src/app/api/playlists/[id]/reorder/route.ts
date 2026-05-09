import { authRoute, resultResponse } from "@/lib/route-handler";
import { reorderSongs } from "@/lib/playlists";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(await reorderSongs(params.id, auth.userId, body.songIds));
}, { route: "/api/playlists/[id]/reorder" });
