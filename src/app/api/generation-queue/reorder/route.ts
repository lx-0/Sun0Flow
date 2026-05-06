import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** POST: Reorder queue items. Body: { orderedIds: string[] } */
export async function POST(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { orderedIds } = await request.json();

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json(
      { error: "orderedIds must be an array", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Verify all IDs belong to this user and are pending
  const items = await prisma.generationQueueItem.findMany({
    where: { userId, status: "pending", id: { in: orderedIds } },
    select: { id: true },
  });

  const validIds = new Set(items.map((i) => i.id));
  const filteredIds = orderedIds.filter((id: string) => validIds.has(id));

  // Update positions in a transaction
  await prisma.$transaction(
    filteredIds.map((id: string, index: number) =>
      prisma.generationQueueItem.update({
        where: { id },
        data: { position: index },
      })
    )
  );

  return NextResponse.json({ success: true });
}
