import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-error";

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

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
    const song = await prisma.song.findFirst({
      where: { id: params.id },
      select: { id: true },
    });
    if (!song) {
      return notFound();
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) return badRequest("rating must be thumbs_up or thumbs_down");
    const { rating } = parsedBody.data;

    const feedback = await prisma.generationFeedback.upsert({
      where: { songId_userId: { songId: params.id, userId: auth.userId } },
      update: { rating },
      create: { songId: params.id, userId: auth.userId, rating },
    });

    return NextResponse.json({ rating: feedback.rating });
}, { route: "/api/songs/[id]/feedback" });
