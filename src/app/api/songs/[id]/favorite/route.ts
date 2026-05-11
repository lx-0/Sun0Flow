import { authRoute, resultResponse } from "@/lib/route-handler";
import { checkFavorite, addFavorite, removeFavorite } from "@/lib/songs";

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    return resultResponse(await checkFavorite(params.id, auth.userId));
  },
  { route: "/api/songs/[id]/favorite" },
);

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    return resultResponse(await addFavorite(params.id, auth.userId));
  },
  { route: "/api/songs/[id]/favorite" },
);

export const DELETE = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    return resultResponse(await removeFavorite(params.id, auth.userId));
  },
  { route: "/api/songs/[id]/favorite" },
);
