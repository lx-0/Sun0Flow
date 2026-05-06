import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

const versionSelect = {
  id: true,
  title: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
} as const;

/** GET /api/songs/[id]/playable-versions — root song + all its variations */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findUnique({
      where: { id },
      select: { id: true, userId: true, parentSongId: true },
    });

    if (!song || song.userId !== userId) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Resolve to root: if this song is a variation, walk up to the root
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

    // Single query: root + all direct variations with ready audio
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
        { status: 404 }
      );
    }

    // Combine: root first, then variations
    const versions = [root, ...variations];

    return NextResponse.json({ versions });
  } catch (error) {
    logServerError("GET /api/songs/[id]/playable-versions", error, {
      route: "/api/songs/playable-versions",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
