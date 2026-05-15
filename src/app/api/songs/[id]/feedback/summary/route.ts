import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute<{ id: string }>(
  async (_request, { params }) => {
    const { id } = params;
    const [thumbsUp, thumbsDown] = await Promise.all([
      prisma.generationFeedback.count({
        where: { songId: id, rating: "thumbs_up" },
      }),
      prisma.generationFeedback.count({
        where: { songId: id, rating: "thumbs_down" },
      }),
    ]);

    return NextResponse.json({ thumbsUp, thumbsDown });
  },
  { route: "/api/songs/[id]/feedback/summary" },
);
