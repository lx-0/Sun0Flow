import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; reactionId: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id, reactionId } = await params;

    const reaction = await prisma.songReaction.findUnique({
      where: { id: reactionId },
      select: {
        id: true,
        songId: true,
        userId: true,
        song: { select: { userId: true } },
      },
    });

    if (!reaction || reaction.songId !== id) {
      return NextResponse.json(
        { error: "Reaction not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Only reaction owner or song owner can delete
    if (reaction.userId !== userId && reaction.song.userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    await prisma.songReaction.delete({ where: { id: reactionId } });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
