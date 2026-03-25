import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const pending = await prisma.report.count({ where: { status: "pending" } });
  return NextResponse.json({ pending });
}
