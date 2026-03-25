import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/feed-generations
 *
 * Returns the user's pending feed generation requests awaiting approval.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await resolveUser(req);
  if (authError) return authError;

  const items = await prisma.pendingFeedGeneration.findMany({
    where: { userId, status: "pending" },
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
}
