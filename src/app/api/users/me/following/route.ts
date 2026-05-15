import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { listFollowing } from "@/lib/follows";
import { zPageParam } from "@/lib/query-params";

const followingQuery = z.object({
  page: zPageParam(),
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await listFollowing(auth.userId, query.page);
    return resultResponse(result);
  },
  { route: "/api/users/me/following", query: followingQuery },
);
