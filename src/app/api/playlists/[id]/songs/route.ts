import { authRoute, resultResponse } from "@/lib/route-handler";
import { addSong } from "@/lib/playlists";
import { addPlaylistSongBody } from "@/lib/playlists/schemas";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params, body }) => {
  return resultResponse(await addSong(params.id, auth.userId, body.songId), { status: 201 });
}, {
  route: "/api/playlists/[id]/songs",
  body: addPlaylistSongBody,
});
