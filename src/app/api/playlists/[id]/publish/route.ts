import { authRoute, resultResponse } from "@/lib/route-handler";
import { togglePublish } from "@/lib/playlists";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  let genre: string | undefined;
  try {
    const body = await request.json();
    if (
      body.genre !== undefined &&
      typeof body.genre === "string" &&
      body.genre.trim().length > 0
    ) {
      genre = body.genre.trim();
    }
  } catch {
    // No body or invalid JSON — genre is optional
  }

  return resultResponse(await togglePublish(params.id, auth.userId, genre));
}, { route: "/api/playlists/[id]/publish" });
