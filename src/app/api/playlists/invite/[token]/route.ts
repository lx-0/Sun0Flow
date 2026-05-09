import { authRoute, resultResponse } from "@/lib/route-handler";
import { getInviteInfo, acceptInvite } from "@/lib/playlists";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    return resultResponse(await getInviteInfo(token));
  } catch (error) {
    logServerError("playlist-invite-get", error, { route: "/api/playlists/invite/[token]" });
    return internalError();
  }
}

export const POST = authRoute<{ token: string }>(async (_request, { auth, params }) => {
  return resultResponse(await acceptInvite(params.token, auth.userId));
}, { route: "/api/playlists/invite/[token]" });
