import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute(async (_request, { auth }) => {
  const items = await prisma.pendingFeedGeneration.findMany({
    where: { userId: auth.userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      feedTitle: true,
      itemTitle: true,
      itemLink: true,
      itemPubDate: true,
      prompt: true,
      style: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
});
