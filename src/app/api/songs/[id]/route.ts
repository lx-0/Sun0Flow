import { NextResponse } from "next/server";
import { computeETag, CacheControl } from "@/lib/cache";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { findUserSong } from "@/lib/songs";
import { updateSongVisibility } from "@/lib/songs";

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

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const { visibility } = body as { visibility?: string };

  if (visibility === undefined) {
    return NextResponse.json(
      { error: "No valid fields to update", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  return resultResponse(
    await updateSongVisibility(params.id, auth.userId, visibility),
  );
});
