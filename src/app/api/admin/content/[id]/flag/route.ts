import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const song = await prisma.song.findUnique({
    where: { id },
    select: { id: true, isHidden: true, title: true },
  });

  if (!song) {
    return NextResponse.json({ error: "Song not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const updated = await prisma.song.update({
    where: { id },
    data: { isHidden: !song.isHidden },
    select: { id: true, isHidden: true },
  });

  await logAdminAction(
    admin!.id,
    updated.isHidden ? "flag_content" : "unflag_content",
    id,
    `Song "${song.title ?? id}" ${updated.isHidden ? "flagged (hidden)" : "unflagged (visible)"}`
  );

  return NextResponse.json(updated);
}
