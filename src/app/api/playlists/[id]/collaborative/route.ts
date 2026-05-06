import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";
import { ownerWhere } from "@/lib/playlists";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: ownerWhere(id, userId),
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const updated = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { isCollaborative: !playlist.isCollaborative },
    });

    invalidateByPrefix(cacheKey("playlists", userId));
    return NextResponse.json({ isCollaborative: updated.isCollaborative });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
