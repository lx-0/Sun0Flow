import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      select: { id: true, isPublic: true },
    });

    if (!playlist || !playlist.isPublic) {
      return NextResponse.json(
        { error: "Playlist not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    await prisma.playlist.update({
      where: { id },
      data: { playCount: { increment: 1 } },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
