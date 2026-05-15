import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-error";

export const POST = adminRoute<{ id: string }>(async (_req, { admin, params }) => {
  const song = await prisma.song.findUnique({
    where: { id: params.id },
    select: { id: true, isHidden: true, title: true },
  });

  if (!song) {
    return notFound("Song not found");
  }

  const updated = await prisma.song.update({
    where: { id: params.id },
    data: { isHidden: !song.isHidden },
    select: { id: true, isHidden: true },
  });

  await logAdminAction(
    admin.adminId,
    updated.isHidden ? "flag_content" : "unflag_content",
    params.id,
    `Song "${song.title ?? params.id}" ${updated.isHidden ? "flagged (hidden)" : "unflagged (visible)"}`
  );

  return NextResponse.json(updated);
}, { route: "/api/admin/content/[id]/flag" });
