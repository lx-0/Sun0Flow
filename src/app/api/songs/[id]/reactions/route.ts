import { z } from "zod";
import { authRoute, optionalAuthRoute, resultResponse } from "@/lib/route-handler";
import { listReactions, createReaction } from "@/lib/reactions";

const querySchema = z.object({
  after: z.string().trim().min(1).max(128).optional(),
});

const postBodySchema = z.object({
  emoji: z.unknown(),
  timestamp: z.unknown(),
});

export const GET = optionalAuthRoute<{ id: string }, undefined, z.infer<typeof querySchema>>(
  async (_request, { auth, params, query }) => {
    return resultResponse(await listReactions(params.id, auth.userId, query.after ?? null));
  },
  { route: "/api/songs/[id]/reactions", query: querySchema }
);

export const POST = authRoute<{ id: string }, z.infer<typeof postBodySchema>>(async (
  _request,
  { auth: authCtx, params, body },
) => {
  return resultResponse(await createReaction(params.id, authCtx.userId, body), { status: 201 });
}, {
  route: "/api/songs/[id]/reactions",
  body: postBodySchema,
});
