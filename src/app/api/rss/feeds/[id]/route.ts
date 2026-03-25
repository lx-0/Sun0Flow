import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

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

  const { autoGenerate } = body as { autoGenerate?: boolean };
  if (typeof autoGenerate !== "boolean") {
    return NextResponse.json(
      { error: "autoGenerate (boolean) is required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const feed = await prisma.rssFeedSubscription.findUnique({ where: { id } });
  if (!feed || feed.userId !== userId) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const updated = await prisma.rssFeedSubscription.update({
    where: { id },
    data: { autoGenerate },
    select: { id: true, url: true, title: true, autoGenerate: true, createdAt: true },
  });

  return NextResponse.json({ feed: updated });
}
