import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: item, error } = requireOwned(
      await prisma.pendingFeedGeneration.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Feed generation",
    );
    if (error) return error;

    if (item.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending items can be approved", code: "CONFLICT" },
        { status: 409 },
      );
    }

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
