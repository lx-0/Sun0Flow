import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/api-error";

export const DELETE = authRoute<{ id: string; commentId: string }>(async (_request, { auth, params }) => {
    const [comment, song] = await Promise.all([
      prisma.comment.findUnique({
        where: { id: params.commentId },
        select: { id: true, userId: true, songId: true },
      }),
      prisma.song.findUnique({
        where: { id: params.id },
        select: { userId: true },
      }),
    ]);

    if (!comment || comment.songId !== params.id) {
      return notFound("Comment not found");
    }

    const isCommentOwner = comment.userId === auth.userId;
    const isSongOwner = song?.userId === auth.userId;

    if (!isCommentOwner && !isSongOwner) {
      return forbidden();
    }

    await prisma.comment.delete({ where: { id: params.commentId } });

    return new NextResponse(null, { status: 204 });
}, { route: "/api/songs/[id]/comments/[commentId]" });
