import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

/** GET /api/songs/[id]/stems — list child stem tracks for a song */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id: songId } = await params;

    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const stems = await prisma.song.findMany({
      where: { parentSongId: songId, userId },
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
  } catch (error) {
    logServerError("stems-route", error, { route: "/api/songs/[id]/stems" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
