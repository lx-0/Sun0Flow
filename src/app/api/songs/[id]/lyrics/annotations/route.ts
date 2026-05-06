import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/songs/[id]/lyrics/annotations — list all annotations
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

    const annotations = await prisma.lyricAnnotation.findMany({
      where: { songId: id },
      orderBy: { lineIndex: "asc" },
      select: { lineIndex: true, body: true },
    });

    return NextResponse.json({ annotations });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// PUT /api/songs/[id]/lyrics/annotations — upsert or delete annotation for a line
// Body: { lineIndex: number; body: string } — body="" deletes the annotation
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
    if (typeof body.lineIndex !== "number") {
      return NextResponse.json(
        { error: "lineIndex must be a number", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (typeof body.body !== "string") {
      return NextResponse.json(
        { error: "body must be a string", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const text = body.body.trim();
    const lineIndex = body.lineIndex as number;

    if (!text) {
      // Delete annotation if empty
      await prisma.lyricAnnotation.deleteMany({
        where: { songId: id, lineIndex },
      });
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.lyricAnnotation.upsert({
      where: { songId_lineIndex: { songId: id, lineIndex } },
      create: { songId: id, lineIndex, body: text },
      update: { body: text },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
