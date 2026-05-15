import { authRoute, resultResponse } from "@/lib/route-handler";
import { toggleShare } from "@/lib/playlists";

export const PATCH = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await toggleShare(params.id, auth.userId));
}, { route: "/api/playlists/[id]/share" });
