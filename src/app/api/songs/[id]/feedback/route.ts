import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-error";

const bodySchema = z.object({
  rating: z.enum(["thumbs_up", "thumbs_down"]),
});

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
    const feedback = await prisma.generationFeedback.findUnique({
      where: { songId_userId: { songId: params.id, userId: auth.userId } },
      select: { rating: true },
    });

    return NextResponse.json({ rating: feedback?.rating ?? null });
}, { route: "/api/songs/[id]/feedback" });

export const POST = authRoute<{ id: string }, z.infer<typeof bodySchema>>(async (
  _request,
  { auth, params, body },
) => {
    const song = await prisma.song.findFirst({
      where: { id: params.id },
      select: { id: true },
    });
    if (!song) {
      return notFound();
    }

    const feedback = await prisma.generationFeedback.upsert({
      where: { songId_userId: { songId: params.id, userId: auth.userId } },
      update: { rating: body.rating },
      create: { songId: params.id, userId: auth.userId, rating: body.rating },
    });

    return NextResponse.json({ rating: feedback.rating });
}, { route: "/api/songs/[id]/feedback", body: bodySchema });
