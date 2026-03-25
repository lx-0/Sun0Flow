import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/feed-generations/[id]
 *
 * Update a pending feed generation. Supports:
 * - Dismiss: { status: "dismissed" }
 * - Edit prompt before approving: { prompt?, style? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error: authError } = await resolveUser(req);
  if (authError) return authError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { status, prompt, style } = body as {
    status?: string;
    prompt?: string;
    style?: string;
  };

  const item = await prisma.pendingFeedGeneration.findUnique({ where: { id } });
  if (!item || item.userId !== userId) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (item.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending items can be updated", code: "CONFLICT" },
      { status: 409 }
    );
  }

  const updateData: Record<string, string> = {};
  if (status === "dismissed") updateData.status = "dismissed";
  if (typeof prompt === "string" && prompt.trim()) updateData.prompt = prompt.trim();
  if (typeof style === "string") updateData.style = style;

  const updated = await prisma.pendingFeedGeneration.update({
    where: { id },
    data: updateData,
    select: { id: true, prompt: true, style: true, status: true },
  });

  return NextResponse.json({ item: updated });
}
