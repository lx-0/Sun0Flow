import { authRoute, resultResponse } from "@/lib/route-handler";
import { restoreSong } from "@/lib/songs";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await restoreSong(params.id, auth.userId));
}, { route: "/api/songs/[id]/restore" });
