import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { getPlaylistActivity } from "@/lib/playlists";

const activityQuery = z.object({
  cursor: z.string().optional(),
});

export const GET = authRoute<{ id: string }, undefined, z.infer<typeof activityQuery>>(
  async (_request, { auth, params, query }) => {
    return resultResponse(await getPlaylistActivity(params.id, auth.userId, query.cursor));
  },
  { route: "/api/playlists/[id]/activity", query: activityQuery },
);
