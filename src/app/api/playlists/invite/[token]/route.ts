import { authRoute, publicRoute, resultResponse } from "@/lib/route-handler";
import { getInviteInfo, acceptInvite } from "@/lib/playlists";

export const GET = publicRoute<{ token: string }>(async (_request, { params }) => {
  return resultResponse(await getInviteInfo(params.token));
}, { route: "/api/playlists/invite/[token]" });

export const POST = authRoute<{ token: string }>(async (_request, { auth, params }) => {
  return resultResponse(await acceptInvite(params.token, auth.userId));
}, { route: "/api/playlists/invite/[token]" });
