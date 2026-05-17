import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { ensurePendingFeedGeneration } from "@/lib/feed-generations";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: item, error } = requireOwned(
      await prisma.pendingFeedGeneration.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Feed generation",
    );
    if (error) return error;

    const statusError = ensurePendingFeedGeneration(item, "approved");
    if (statusError) return statusError;

    await prisma.pendingFeedGeneration.update({
      where: { id: params.id },
      data: { status: "approved" },
    });

    return NextResponse.json({
      prompt: item.prompt,
      style: item.style,
      itemTitle: item.itemTitle,
    });
  },
  { route: "/api/feed-generations/[id]/approve" },
);
