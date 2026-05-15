import { authRoute, resultResponse } from "@/lib/route-handler";
import { togglePublish } from "@/lib/playlists";
import { togglePublishBody } from "@/lib/playlists/schemas";

export const PATCH = authRoute<{ id: string }>(
  async (_request, { auth, params, body }) =>
    resultResponse(await togglePublish(params.id, auth.userId, body.genre)),
  {
    route: "/api/playlists/[id]/publish",
    body: togglePublishBody,
  },
);
