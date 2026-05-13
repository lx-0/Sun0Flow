import { authRoute, resultResponse } from "@/lib/route-handler";
import { archiveSong } from "@/lib/songs";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await archiveSong(params.id, auth.userId));
}, { route: "/api/songs/[id]/archive" });
