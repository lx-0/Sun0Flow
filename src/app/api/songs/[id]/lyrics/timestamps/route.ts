import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/songs/[id]/lyrics/timestamps — list all timestamps for the song
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const timestamps = await prisma.lyricTimestamp.findMany({
      where: { songId: id },
      orderBy: { lineIndex: "asc" },
      select: { lineIndex: true, startTime: true },
    });

    return NextResponse.json({ timestamps });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// PUT /api/songs/[id]/lyrics/timestamps — replace all timestamps
// Body: { timestamps: Array<{ lineIndex: number; startTime: number }> }
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    if (!Array.isArray(body.timestamps)) {
      return NextResponse.json(
        { error: "timestamps must be an array", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const entries = body.timestamps as Array<{ lineIndex: number; startTime: number }>;
    for (const e of entries) {
      if (typeof e.lineIndex !== "number" || typeof e.startTime !== "number") {
        return NextResponse.json(
          { error: "Each timestamp needs lineIndex and startTime as numbers", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // Upsert each entry
    await prisma.$transaction(
      entries.map((e) =>
        prisma.lyricTimestamp.upsert({
          where: { songId_lineIndex: { songId: id, lineIndex: e.lineIndex } },
          create: { songId: id, lineIndex: e.lineIndex, startTime: e.startTime },
          update: { startTime: e.startTime },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
