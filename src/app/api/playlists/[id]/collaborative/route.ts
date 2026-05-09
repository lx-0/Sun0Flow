import { authRoute, resultResponse } from "@/lib/route-handler";
import { toggleCollaborative } from "@/lib/playlists";

export const PATCH = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await toggleCollaborative(params.id, auth.userId));
}, { route: "/api/playlists/[id]/collaborative" });
