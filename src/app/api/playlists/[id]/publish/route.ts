import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { togglePublish } from "@/lib/playlists";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

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

    const result = await togglePublish(id, userId, genre);
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
