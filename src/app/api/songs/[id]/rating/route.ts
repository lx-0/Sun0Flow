import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const stars = body.stars;
    const note = typeof body.note === "string" ? body.note.trim() : null;

    if (typeof stars !== "number" || stars < 0 || stars > 5 || !Number.isInteger(stars)) {
      return NextResponse.json({ error: "stars must be an integer 0-5" }, { status: 400 });
    }

    const updated = await prisma.song.update({
      where: { id: song.id },
      data: {
        rating: stars === 0 ? null : stars,
        ratingNote: stars === 0 ? null : (note || null),
      },
    });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({
      rating: updated.rating,
      ratingNote: updated.ratingNote,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
