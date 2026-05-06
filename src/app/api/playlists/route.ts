import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { listPlaylists, createPlaylist } from "@/lib/playlists";

export const GET = authRoute(async (_request, { auth }) => {
  const result = await listPlaylists(auth.userId);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": CacheControl.privateShort },
  });
}, { route: "/api/playlists" });

const createPlaylistBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional(),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createPlaylist(auth.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data, { status: 201 });
}, { route: "/api/playlists", body: createPlaylistBody });
