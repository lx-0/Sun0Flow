import { NextResponse } from "next/server";
import { z } from "zod";
import { computeETag, CacheControl } from "@/lib/cache";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { findUserSong } from "@/lib/songs";
import { updateSongVisibility } from "@/lib/songs";

const patchBodySchema = z.object({
  visibility: z.enum(["public", "private"]),
});

export const GET = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const song = await findUserSong(auth.userId, params.id);

  if (!song) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const etag = computeETag(song);

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CacheControl.privateShort,
      },
    });
  }

  return NextResponse.json({ song }, {
    headers: {
      ETag: etag,
      "Cache-Control": CacheControl.privateShort,
    },
  });
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchBodySchema>>(async (
  _request,
  { auth, params, body },
) => {
  return resultResponse(
    await updateSongVisibility(params.id, auth.userId, body.visibility),
  );
}, {
  route: "/api/songs/[id]",
  body: patchBodySchema,
});
