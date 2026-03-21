import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; tagId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const songTag = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId: song.id, tagId: params.tagId } },
    });
    if (!songTag) {
      return NextResponse.json({ error: "Tag not assigned to this song" }, { status: 404 });
    }

    await prisma.songTag.delete({ where: { id: songTag.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
