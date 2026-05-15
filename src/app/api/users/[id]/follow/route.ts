import { authRoute, resultResponse } from "@/lib/route-handler";
import { followUser, unfollowUser } from "@/lib/follows";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const result = await followUser(auth.userId, params.id);
    return resultResponse(result, { status: 200 });
  },
  { route: "/api/users/[id]/follow" },
);

export const DELETE = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const result = await unfollowUser(auth.userId, params.id);
    return resultResponse(result, { status: 200 });
  },
  { route: "/api/users/[id]/follow" },
);
