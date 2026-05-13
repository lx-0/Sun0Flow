import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/api-error";

export const DELETE = authRoute<{ id: string; reactionId: string }>(async (_request, { auth, params }) => {
    const reaction = await prisma.songReaction.findUnique({
      where: { id: params.reactionId },
      select: {
        id: true,
        songId: true,
        userId: true,
        song: { select: { userId: true } },
      },
    });

    if (!reaction || reaction.songId !== params.id) {
      return notFound("Reaction not found");
    }

    // Only reaction owner or song owner can delete
    if (reaction.userId !== auth.userId && reaction.song.userId !== auth.userId) {
      return forbidden();
    }

    await prisma.songReaction.delete({ where: { id: params.reactionId } });

    return new NextResponse(null, { status: 204 });
}, { route: "/api/songs/[id]/reactions/[reactionId]" });
