import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/feed-generations/[id]/approve
 *
 * Marks a pending feed generation as approved and returns the prompt/style
 * so the client can navigate to the generate page pre-filled.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error: authError } = await resolveUser(req);
  if (authError) return authError;

  const { id } = await params;

  const item = await prisma.pendingFeedGeneration.findUnique({ where: { id } });
  if (!item || item.userId !== userId) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (item.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending items can be approved", code: "CONFLICT" },
      { status: 409 }
    );
  }

  await prisma.pendingFeedGeneration.update({
    where: { id },
    data: { status: "approved" },
  });

  return NextResponse.json({
    prompt: item.prompt,
    style: item.style,
    itemTitle: item.itemTitle,
  });
}
