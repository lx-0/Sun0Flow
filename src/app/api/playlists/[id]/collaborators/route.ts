import { authRoute, resultResponse } from "@/lib/route-handler";
import {
  listCollaborators,
  inviteByUsername,
  createInviteLink,
} from "@/lib/playlists";
import { z } from "zod";

const postBodySchema = z.object({
  username: z.string().optional(),
  role: z.string().optional(),
});

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await listCollaborators(params.id, auth.userId));
}, { route: "/api/playlists/[id]/collaborators" });

export const POST = authRoute<{ id: string }, z.infer<typeof postBodySchema>>(async (
  _request,
  { auth, params, body },
) => {
  const { username, role } = body;

  const result = username
    ? await inviteByUsername(params.id, auth.userId, username, role)
    : await createInviteLink(params.id, auth.userId, role);
  return resultResponse(result, { status: 201 });
}, { route: "/api/playlists/[id]/collaborators", body: postBodySchema });
