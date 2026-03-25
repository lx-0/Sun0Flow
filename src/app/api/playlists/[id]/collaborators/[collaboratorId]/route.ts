import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

// DELETE /api/playlists/[id]/collaborators/[collaboratorId] — remove collaborator (owner only)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; collaboratorId: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const collaborator = await prisma.playlistCollaborator.findFirst({
      where: { id: params.collaboratorId, playlistId: playlist.id },
    });

    if (!collaborator) {
      return NextResponse.json({ error: "Collaborator not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.playlistCollaborator.delete({ where: { id: collaborator.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
