import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** DELETE: Cancel/remove a queue item */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { id } = await params;

  const item = await prisma.generationQueueItem.findFirst({
    where: { id, userId },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (item.status === "processing") {
    // Mark as cancelled rather than deleting — the processing song will still complete
    await prisma.generationQueueItem.update({
      where: { id },
      data: { status: "cancelled" },
    });
  } else {
    await prisma.generationQueueItem.delete({ where: { id } });
  }

  return NextResponse.json({ success: true });
}
