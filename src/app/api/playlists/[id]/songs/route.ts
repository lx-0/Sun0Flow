import { authRoute, resultResponse } from "@/lib/route-handler";
import { addSong } from "@/lib/playlists";

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(await addSong(params.id, auth.userId, body.songId), { status: 201 });
}, { route: "/api/playlists/[id]/songs" });
