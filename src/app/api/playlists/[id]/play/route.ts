import { publicRoute, resultResponse } from "@/lib/route-handler";
import { recordPlay } from "@/lib/playlists";

export const POST = publicRoute<{ id: string }>(async (_request, { params }) => {
  return resultResponse(await recordPlay(params.id));
}, { route: "/api/playlists/[id]/play" });
