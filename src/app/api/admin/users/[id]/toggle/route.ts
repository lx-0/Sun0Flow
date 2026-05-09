import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  if (id === admin!.id) {
    return NextResponse.json({ error: "Cannot disable your own account", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isDisabled: true, email: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isDisabled: !target.isDisabled },
    select: { id: true, isDisabled: true },
  });

  await logAdminAction(
    admin!.id,
    updated.isDisabled ? "disable_user" : "enable_user",
    id,
    `User ${target.email} ${updated.isDisabled ? "disabled" : "enabled"}`
  );

  return NextResponse.json(updated);
}
