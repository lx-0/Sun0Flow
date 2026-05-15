import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const versionSelect = {
  id: true,
  title: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
} as const;

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({
        where: { id: params.id },
        select: { id: true, userId: true, parentSongId: true },
      }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    let rootId = song.id;
    if (song.parentSongId) {
      let currentParentId: string | null = song.parentSongId;
      while (currentParentId) {
        const ancestor: { id: string; parentSongId: string | null } | null =
          await prisma.song.findUnique({
            where: { id: currentParentId },
            select: { id: true, parentSongId: true },
          });
        if (!ancestor) break;
        rootId = ancestor.id;
        currentParentId = ancestor.parentSongId;
      }
    }

    const [root, variations] = await Promise.all([
      prisma.song.findUnique({
        where: { id: rootId },
        select: versionSelect,
      }),
      prisma.song.findMany({
        where: {
          parentSongId: rootId,
          generationStatus: "ready",
          audioUrl: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: versionSelect,
      }),
    ]);

    if (!root) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const versions = [root, ...variations];

    return NextResponse.json({ versions });
  },
  { route: "/api/songs/[id]/playable-versions" },
);
