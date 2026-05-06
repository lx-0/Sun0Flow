import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const { id, tagId } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const songTag = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId: song.id, tagId: tagId } },
    });
    if (!songTag) {
      return NextResponse.json({ error: "Tag not assigned to this song", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.songTag.delete({ where: { id: songTag.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
