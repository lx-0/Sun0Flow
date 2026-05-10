import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    const stems = await prisma.song.findMany({
      where: { parentSongId: params.id, userId: auth.userId },
      select: {
        id: true,
        title: true,
        audioUrl: true,
        generationStatus: true,
        duration: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ stems });
  },
  { route: "/api/songs/[id]/stems" },
);
