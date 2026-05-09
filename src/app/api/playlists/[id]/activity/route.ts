import { authRoute, resultResponse } from "@/lib/route-handler";
import { getPlaylistActivity } from "@/lib/playlists";

export const GET = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  return resultResponse(await getPlaylistActivity(params.id, auth.userId, cursor));
}, { route: "/api/playlists/[id]/activity" });
