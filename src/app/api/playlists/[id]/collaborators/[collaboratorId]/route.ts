import { authRoute, resultResponse } from "@/lib/route-handler";
import { removeCollaborator } from "@/lib/playlists";

export const DELETE = authRoute<{ id: string; collaboratorId: string }>(async (_request, { auth, params }) => {
  return resultResponse(await removeCollaborator(params.id, auth.userId, params.collaboratorId));
}, { route: "/api/playlists/[id]/collaborators/[collaboratorId]" });
