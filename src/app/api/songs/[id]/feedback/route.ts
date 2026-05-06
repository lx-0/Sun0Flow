import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const feedback = await prisma.generationFeedback.findUnique({
      where: { songId_userId: { songId: id, userId } },
      select: { rating: true },
    });

    return NextResponse.json({ rating: feedback?.rating ?? null });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { rating } = body;

    if (rating !== "thumbs_up" && rating !== "thumbs_down") {
      return NextResponse.json(
        { error: "rating must be thumbs_up or thumbs_down", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const feedback = await prisma.generationFeedback.upsert({
      where: { songId_userId: { songId: id, userId } },
      update: { rating },
      create: { songId: id, userId, rating },
    });

    return NextResponse.json({ rating: feedback.rating });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
