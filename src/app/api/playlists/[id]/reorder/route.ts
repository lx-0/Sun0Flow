import { authRoute, resultResponse } from "@/lib/route-handler";
import { reorderSongs } from "@/lib/playlists";
import { reorderPlaylistSongsBody } from "@/lib/playlists/schemas";

export const PATCH = authRoute<{ id: string }>(async (_request, { auth, params, body }) => {
  return resultResponse(await reorderSongs(params.id, auth.userId, body.songIds));
}, {
  route: "/api/playlists/[id]/reorder",
  body: reorderPlaylistSongsBody,
});
