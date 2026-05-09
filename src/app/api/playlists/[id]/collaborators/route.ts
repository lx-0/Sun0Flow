import { authRoute, resultResponse } from "@/lib/route-handler";
import {
  listCollaborators,
  inviteByUsername,
  createInviteLink,
} from "@/lib/playlists";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await listCollaborators(params.id, auth.userId));
}, { route: "/api/playlists/[id]/collaborators" });

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json().catch(() => ({}));
  const { username, role } = body as { username?: string; role?: string };

  const result = username
    ? await inviteByUsername(params.id, auth.userId, username, role)
    : await createInviteLink(params.id, auth.userId, role);
  return resultResponse(result, { status: 201 });
}, { route: "/api/playlists/[id]/collaborators" });
