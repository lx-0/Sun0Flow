import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { error: authError } = await resolveUser(request);
    if (authError) return authError;

    const [thumbsUp, thumbsDown] = await Promise.all([
      prisma.generationFeedback.count({
        where: { songId: id, rating: "thumbs_up" },
      }),
      prisma.generationFeedback.count({
        where: { songId: id, rating: "thumbs_down" },
      }),
    ]);

    return NextResponse.json({ thumbsUp, thumbsDown });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
