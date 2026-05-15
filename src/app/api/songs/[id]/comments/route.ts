import { z } from "zod";
import { authRoute, publicRoute, resultResponse } from "@/lib/route-handler";
import { listComments, createComment } from "@/lib/comments";
import { zPageParam } from "@/lib/query-params";

const listCommentsQuery = z.object({
  page: zPageParam(1),
});

const createCommentBody = z.object({
  body: z.string().min(1, "Comment body must be 1–500 characters").max(500),
  timestamp: z.unknown().optional(),
});

export const GET = publicRoute<{ id: string }, undefined, z.infer<typeof listCommentsQuery>>(
  async (_request, { params, query }) => {
    return resultResponse(await listComments(params.id, query.page));
  },
  { route: "/api/songs/[id]/comments", query: listCommentsQuery },
);

export const POST = authRoute<{ id: string }, z.infer<typeof createCommentBody>>(
  async (_request, { auth, params, body }) => {
    return resultResponse(await createComment(params.id, auth.userId, body), { status: 201 });
  },
  { route: "/api/songs/[id]/comments", body: createCommentBody },
);
