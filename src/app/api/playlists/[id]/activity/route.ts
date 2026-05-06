import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { getPlaylistActivity } from "@/lib/playlists";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const result = await getPlaylistActivity(id, userId, cursor);
    if (!result.ok)
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
