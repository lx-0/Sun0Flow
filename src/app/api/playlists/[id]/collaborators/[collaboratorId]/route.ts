import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { removeCollaborator } from "@/lib/playlists";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> },
) {
  const { id, collaboratorId } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const result = await removeCollaborator(id, userId, collaboratorId);
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
