import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const { id } = await params;

  const digest = await prisma.inspirationDigest.findUnique({
    where: { id },
    select: { id: true, userId: true, title: true, items: true, createdAt: true },
  });

  if (!digest || digest.userId !== userId) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ digest });
}
