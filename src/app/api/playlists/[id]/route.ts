import { authRoute, resultResponse } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { getPlaylist, updatePlaylist, deletePlaylist } from "@/lib/playlists";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getPlaylist(params.id, auth.userId), {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/playlists/[id]" });

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(await updatePlaylist(params.id, auth.userId, body));
}, { route: "/api/playlists/[id]" });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await deletePlaylist(params.id, auth.userId));
}, { route: "/api/playlists/[id]" });
