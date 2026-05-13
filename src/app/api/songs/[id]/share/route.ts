import { authRoute, resultResponse } from "@/lib/route-handler";
import { toggleSongShare } from "@/lib/songs";

export const PATCH = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await toggleSongShare(params.id, auth.userId));
}, { route: "/api/songs/[id]/share" });
