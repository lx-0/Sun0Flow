import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { songRoute } from "@/lib/route-handler";
import { invalidateByPrefix } from "@/lib/cache";
import { badRequest } from "@/lib/api-error";

export const GET = songRoute(async (_request, { song }) => {
  return NextResponse.json({
    rating: song.rating,
    ratingNote: song.ratingNote,
  });
}, { route: "/api/songs/[id]/rating" });

export const PATCH = songRoute(async (request, { auth, song }) => {
  const body = await request.json();
  const stars = body.stars;

  if (typeof stars !== "number" || stars < 0 || stars > 5 || !Number.isInteger(stars)) {
    return badRequest("stars must be an integer 0-5");
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      return badRequest("note must be a string");
    }
    const trimmed = body.note.trim();
    if (trimmed.length > 500) {
      return badRequest("note must be 500 characters or fewer");
    }
    note = trimmed || null;
  }

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: {
      rating: stars === 0 ? null : stars,
      ratingNote: stars === 0 ? null : (note || null),
    },
  });

  invalidateByPrefix(`dashboard-stats:${auth.userId}`);

  return NextResponse.json({
    rating: updated.rating,
    ratingNote: updated.ratingNote,
  });
}, { route: "/api/songs/[id]/rating" });
