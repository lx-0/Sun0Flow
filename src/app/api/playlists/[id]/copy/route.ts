import { authRoute, resultResponse } from "@/lib/route-handler";
import { copyPlaylist } from "@/lib/playlists";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await copyPlaylist(params.id, auth.userId), { status: 201 });
}, { route: "/api/playlists/[id]/copy" });
