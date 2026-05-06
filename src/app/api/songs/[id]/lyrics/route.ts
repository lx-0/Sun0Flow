import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";

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
      select: { lyrics: true, lyricsEdited: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      original: song.lyrics ?? null,
      edited: song.lyricsEdited ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();

    let edited: string | null = null;
    if (body.edited !== undefined && body.edited !== null) {
      const { value, error } = sanitizeText(body.edited, "lyrics");
      if (error) {
        return NextResponse.json({ error, code: "VALIDATION_ERROR" }, { status: 400 });
      }
      edited = value || null;
    }

    const updated = await prisma.song.update({
      where: { id: song.id },
      data: { lyricsEdited: edited },
      select: { lyrics: true, lyricsEdited: true },
    });

    return NextResponse.json({
      original: updated.lyrics ?? null,
      edited: updated.lyricsEdited ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
